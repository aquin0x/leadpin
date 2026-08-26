import { Request, Response } from 'express';
import {
  addLine,
  removeLine,
  logoutLine,
  initLine,
  listLines,
  getLineStatus,
  startCampaign,
  stopCampaign,
  getCampaign,
  sendSingleMessage,
} from '../services/whatsapp';
import {
  assertCanSendMessages,
  incrementMessages,
} from '../services/subscription';
import { and, eq, count } from 'drizzle-orm';
import { db } from '../db/client';
import { listItems, lists } from '../db/schema';

function userId(req: Request): string {
  return (req as any).user.id;
}

export const getLines = async (req: Request, res: Response) => {
  const uid = userId(req);
  return res.json({ lines: await listLines(uid) });
};

export const createLine = async (req: Request, res: Response) => {
  const uid = userId(req);
  const { label } = req.body || {};
  const session = await addLine(uid, label);
  return res.status(201).json({
    id: session.lineId,
    label: session.label,
    status: session.status,
    qr: session.qrDataUrl ?? null,
  });
};

export const getLine = async (req: Request, res: Response) => {
  const uid = userId(req);
  const line = await getLineStatus(uid, String(req.params.id));
  if (!line) return res.status(404).json({ message: 'Hat bulunamadı' });
  return res.json(line);
};

export const deleteLine = async (req: Request, res: Response) => {
  const uid = userId(req);
  const ok = await removeLine(uid, String(req.params.id));
  if (!ok) return res.status(404).json({ message: 'Hat bulunamadı' });
  return res.json({ message: 'Hat silindi' });
};

export const reconnectLine = async (req: Request, res: Response) => {
  const uid = userId(req);
  const lineId = String(req.params.id);
  const ok = await logoutLine(uid, lineId);
  if (!ok) return res.status(404).json({ message: 'Hat bulunamadı' });
  // Yeniden initialize et ki yeni QR çıksın
  const session = await initLine(uid, lineId);
  return res.json({ status: session?.status ?? 'disconnected' });
};

export const startWhatsAppCampaign = async (req: Request, res: Response) => {
  try {
    const uid = userId(req);
    const {
      listId,
      lineId,
      messageTemplate,
      messageTemplateNoWebsite,
      minDelaySec,
      maxDelaySec,
      coffeeBreakEvery,
      coffeeBreakMinutes,
      media,
    } = req.body || {};

    if (!listId || !messageTemplate) {
      return res.status(400).json({ message: 'listId ve messageTemplate zorunlu' });
    }

    // Plan limiti: liste boyutu kadar mesaj kotası lazım
    const user = (req as any).user;
    // Liste sahipliğini doğrula — aksi halde başkasının listesine kampanya
    // başlatılabilirdi.
    const [ownedList] = await db
      .select({ id: lists.id })
      .from(lists)
      .where(and(eq(lists.id, String(listId)), eq(lists.user_id, uid)))
      .limit(1);
    if (!ownedList) {
      return res.status(404).json({ message: 'Liste bulunamadı' });
    }

    const [sizeRow] = await db
      .select({ value: count() })
      .from(listItems)
      .where(eq(listItems.list_id, String(listId)));
    const listSize = sizeRow?.value ?? 0;
    try {
      await assertCanSendMessages(user, listSize);
    } catch (e: any) {
      return res.status(e.statusCode || 500).json({ message: e.message, code: e.code });
    }
    // Optimist sayım — kampanya başladıysa kotaya dahil et. Skipped olanları
    // geri ödeme yapmıyoruz (basitlik için; kullanıcı için biraz konservatif).
    await incrementMessages(uid, listSize);

    const campaign = await startCampaign({
      userId: uid,
      listId,
      lineId,
      messageTemplate,
      messageTemplateNoWebsite,
      minDelaySec,
      maxDelaySec,
      coffeeBreakEvery,
      coffeeBreakMinutes,
      media,
    });
    return res.status(201).json(campaign);
  } catch (err: any) {
    return res.status(400).json({ message: err.message });
  }
};

export const stopWhatsAppCampaign = async (req: Request, res: Response) => {
  const uid = userId(req);
  const campaign = stopCampaign(uid);
  if (!campaign) return res.status(404).json({ message: 'Çalışan kampanya yok' });
  return res.json({ message: 'Durdurma isteği alındı', campaign });
};

export const sendSingle = async (req: Request, res: Response) => {
  try {
    const uid = userId(req);
    const { businessId, message, lineId, media } = req.body || {};
    if (!businessId || !message) {
      return res.status(400).json({ message: 'businessId ve message zorunlu' });
    }
    // Plan limiti: 1 mesajlık kota
    try {
      await assertCanSendMessages((req as any).user, 1);
    } catch (e: any) {
      return res.status(e.statusCode || 500).json({ message: e.message, code: e.code });
    }
    const result = await sendSingleMessage({ userId: uid, businessId, message, lineId, media });
    if (result.ok) {
      await incrementMessages(uid, 1);
      return res.json(result);
    }
    if (result.reason === 'not_ready' || result.reason === 'no_line') {
      return res.status(409).json({
        ok: false,
        reason: result.reason,
        ...('lines' in result ? { lines: result.lines } : {}),
        ...('hint' in result ? { hint: result.hint } : {}),
      });
    }
    return res.status(400).json(result);
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
};

export const getCampaignStatus = async (req: Request, res: Response) => {
  const uid = userId(req);
  const campaign = getCampaign(uid);
  return res.json({ campaign });
};
