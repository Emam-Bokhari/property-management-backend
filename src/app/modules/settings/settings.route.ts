import express from 'express';
import { SettingControllers } from './settings.controller';

const router = express.Router();

router
  .get('/privacy-policy', SettingControllers.getPrivacyPolicy)
  .get('/account-delete-policy', SettingControllers.getAccountDelete)
  .get('/support', SettingControllers.getSupport);

export const SettingRoutes = router;
