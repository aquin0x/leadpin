import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';
import {
  getLines,
  createLine,
  getLine,
  deleteLine,
  reconnectLine,
  sendSingle,
  startWhatsAppCampaign,
  stopWhatsAppCampaign,
  getCampaignStatus,
} from '../controllers/whatsapp.controller';
import {
  getSettings,
  updateSettings,
  listRules,
  createRule,
  updateRule,
  deleteRule,
} from '../controllers/automation.controller';
import {
  listTemplates,
  createTemplate,
  updateTemplate,
  deleteTemplate,
} from '../controllers/template.controller';
import {
  listScheduled,
  createScheduled,
  cancelScheduled,
  deleteScheduled,
} from '../controllers/scheduled.controller';

const router = Router();

router.use(authMiddleware);

// Hat yönetimi
router.get('/lines', getLines);
router.post('/lines', createLine);
router.get('/lines/:id', getLine);
router.delete('/lines/:id', deleteLine);
router.post('/lines/:id/reconnect', reconnectLine);

// Mesaj gönderimi
router.post('/send-single', sendSingle);
router.post('/campaign/start', startWhatsAppCampaign);
router.post('/campaign/stop', stopWhatsAppCampaign);
router.get('/campaign', getCampaignStatus);

// Otomasyon ayarları (karşılama / oto-cevap / zamanlanmış)
router.get('/automation/settings/:feature', getSettings);
router.put('/automation/settings/:feature', updateSettings);

// Oto-cevap kuralları (karşılama kuralı da burada, type='greeting')
router.get('/rules', listRules);
router.post('/rules', createRule);
router.put('/rules/:id', updateRule);
router.delete('/rules/:id', deleteRule);

// Mesaj şablonları
router.get('/templates', listTemplates);
router.post('/templates', createTemplate);
router.put('/templates/:id', updateTemplate);
router.delete('/templates/:id', deleteTemplate);

// Zamanlanmış kampanyalar
router.get('/scheduled', listScheduled);
router.post('/scheduled', createScheduled);
router.post('/scheduled/:id/cancel', cancelScheduled);
router.delete('/scheduled/:id', deleteScheduled);

export default router;
