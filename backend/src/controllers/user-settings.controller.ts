import { Request, Response } from 'express';
import net from 'net';
import { supabase } from '../utils/supabase';
import { restartLinesForUser } from '../services/whatsapp';

function userId(req: Request): string {
  return (req as any).user.id;
}

interface SettingsRow {
  user_id: string;
  short_link_public_url: string | null;
  short_link_redirect_url: string | null;
  whatsapp_proxy_host: string | null;
  whatsapp_proxy_port: number | null;
  whatsapp_proxy_type: string | null;
}

const EMPTY = (uid: string): SettingsRow => ({
  user_id: uid,
  short_link_public_url: null,
  short_link_redirect_url: null,
  whatsapp_proxy_host: null,
  whatsapp_proxy_port: null,
  whatsapp_proxy_type: null,
});

export const getUserSettings = async (req: Request, res: Response) => {
  const uid = userId(req);
  const { data, error } = await supabase
    .from('user_settings')
    .select('*')
    .eq('user_id', uid)
    .maybeSingle();
  if (error) return res.status(400).json({ message: error.message });
  return res.json(data ?? EMPTY(uid));
};

export const updateUserSettings = async (req: Request, res: Response) => {
  const uid = userId(req);
  const body = req.body || {};

  const proxyType =
    body.whatsapp_proxy_type === 'socks5' ? 'socks5'
    : body.whatsapp_proxy_type === 'http' ? 'http'
    : body.whatsapp_proxy_type == null ? null
    : 'http';

  const portRaw = body.whatsapp_proxy_port;
  const port =
    portRaw == null || portRaw === '' ? null
    : Number.isFinite(Number(portRaw)) ? Number(portRaw)
    : null;

  const patch: Partial<SettingsRow> = {
    short_link_public_url: trimOrNull(body.short_link_public_url),
    short_link_redirect_url: trimOrNull(body.short_link_redirect_url),
    whatsapp_proxy_host: trimOrNull(body.whatsapp_proxy_host),
    whatsapp_proxy_port: port,
    whatsapp_proxy_type: proxyType,
  };

  // Önceki proxy değerlerini al — değişmiş mi kontrol için
  const { data: prev } = await supabase
    .from('user_settings')
    .select('whatsapp_proxy_host, whatsapp_proxy_port, whatsapp_proxy_type')
    .eq('user_id', uid)
    .maybeSingle();

  const { data, error } = await supabase
    .from('user_settings')
    .upsert({ user_id: uid, ...patch, updated_at: new Date().toISOString() })
    .select('*')
    .single();
  if (error) return res.status(400).json({ message: error.message });

  const proxyChanged =
    (prev?.whatsapp_proxy_host ?? null) !== patch.whatsapp_proxy_host ||
    (prev?.whatsapp_proxy_port ?? null) !== patch.whatsapp_proxy_port ||
    (prev?.whatsapp_proxy_type ?? null) !== patch.whatsapp_proxy_type;

  if (proxyChanged) {
    // Background — kullanıcıyı bekletmemek için await yok
    restartLinesForUser(uid).catch((e) =>
      console.error(`[user-settings] restart lines failed for ${uid}:`, e?.message)
    );
  }

  return res.json(data);
};

export const testProxy = async (req: Request, res: Response) => {
  const { host, port, type } = (req.body || {}) as {
    host?: string;
    port?: number | string;
    type?: 'http' | 'socks5';
  };

  if (!host || !port) {
    return res.status(400).json({ ok: false, message: 'host ve port zorunlu' });
  }
  const portNum = Number(port);
  if (!Number.isFinite(portNum) || portNum <= 0 || portNum > 65535) {
    return res.status(400).json({ ok: false, message: 'Geçersiz port' });
  }

  try {
    const started = Date.now();
    if (type === 'socks5') {
      await testSocks5(host, portNum);
    } else {
      await testHttpConnect(host, portNum);
    }
    return res.json({ ok: true, latencyMs: Date.now() - started });
  } catch (err: any) {
    return res
      .status(200)
      .json({ ok: false, message: err?.message || 'Proxy testi başarısız' });
  }
};

function trimOrNull(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t ? t : null;
}

// HTTP proxy: CONNECT example.com:443 -> bekle "HTTP/1.1 200"
function testHttpConnect(host: string, port: number, timeoutMs = 6000): Promise<void> {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host, port });
    let buf = '';
    let done = false;

    const finish = (err?: Error) => {
      if (done) return;
      done = true;
      socket.destroy();
      err ? reject(err) : resolve();
    };

    socket.setTimeout(timeoutMs);
    socket.on('connect', () => {
      socket.write('CONNECT example.com:443 HTTP/1.1\r\nHost: example.com:443\r\n\r\n');
    });
    socket.on('data', (chunk) => {
      buf += chunk.toString('ascii');
      const line = buf.split('\r\n', 1)[0] || '';
      if (!line) return;
      // 200 = tunnel kuruldu, 407 = auth gerekli (user dedi gerekmez ama bilgi verelim)
      if (/^HTTP\/1\.[01] 2\d\d/.test(line)) finish();
      else if (/^HTTP\/1\.[01] 407/.test(line))
        finish(new Error('Proxy kimlik doğrulaması istiyor (407)'));
      else finish(new Error(`Proxy beklenmeyen yanıt: ${line.slice(0, 80)}`));
    });
    socket.on('timeout', () => finish(new Error('Bağlantı zaman aşımı')));
    socket.on('error', (e) => finish(e));
    socket.on('close', () => finish(new Error('Bağlantı kapandı')));
  });
}

// SOCKS5 greeting: 0x05 0x01 0x00 -> bekle 0x05 0x00 (no auth kabul edildi)
function testSocks5(host: string, port: number, timeoutMs = 6000): Promise<void> {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host, port });
    let done = false;

    const finish = (err?: Error) => {
      if (done) return;
      done = true;
      socket.destroy();
      err ? reject(err) : resolve();
    };

    socket.setTimeout(timeoutMs);
    socket.on('connect', () => {
      socket.write(Buffer.from([0x05, 0x01, 0x00]));
    });
    socket.on('data', (chunk) => {
      if (chunk.length < 2 || chunk[0] !== 0x05) {
        return finish(new Error('Geçerli SOCKS5 yanıtı değil'));
      }
      if (chunk[1] === 0x00) finish();
      else if (chunk[1] === 0x02) finish(new Error('SOCKS5 kimlik doğrulaması istiyor'));
      else finish(new Error(`SOCKS5 yöntem hatası (${chunk[1]})`));
    });
    socket.on('timeout', () => finish(new Error('Bağlantı zaman aşımı')));
    socket.on('error', (e) => finish(e));
    socket.on('close', () => finish(new Error('Bağlantı kapandı')));
  });
}
