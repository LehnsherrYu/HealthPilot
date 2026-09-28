import express from 'express';
import {
  createSymptomJournalSchema,
  updateSymptomJournalSchema,
  searchSymptomJournalSchema,
  symptomJournalIdSchema,
  symptomJournalVersionSchema,
} from '../../schemas/symptomJournalSchemas.js';
import service, {
  SymptomJournalError,
} from '../../services/symptomJournalService.js';

const router = express.Router();
router.use((req, res, next) => {
  res.set('Cache-Control', 'no-store');
  const actor = req.authenticatedUserId;
  if (!actor || !req.userId) {
    res
      .status(401)
      .json({ error: 'Authentication required.', code: 'UNAUTHORIZED' });
    return;
  }
  if (
    req.userId !== actor ||
    (req.originalUserId && req.originalUserId !== actor) ||
    (req.activeUserId && req.activeUserId !== actor) ||
    req.headers['x-on-behalf-of-user-id'] ||
    (req.cookies?.sparky_active_user_id &&
      req.cookies.sparky_active_user_id !== actor)
  ) {
    res.status(403).json({
      error: 'This journal is only available to its owner.',
      code: 'OWNER_ONLY',
    });
    return;
  }
  next();
});
function invalid(res: express.Response): void {
  res
    .status(400)
    .json({ error: 'Invalid journal request.', code: 'INVALID_REQUEST' });
}
/**
 * @swagger
 * /v2/symptom-journal:
 *   post:
 *     summary: Create an owner-only symptom event with immutable original text
 *     tags: [HealthPilot Symptom Journal]
 *     security: [{cookieAuth: []}, {apiKeyAuth: []}]
 *     description: See docs/healthpilot/SYMPTOM_JOURNAL_V1.md and shared createSymptomJournalSchema for the strict body contract. No delegation or report sharing.
 *     responses:
 *       201: {description: Created event}
 *       400: {description: Invalid event fields or timing}
 *       401: {description: Authentication required}
 *       403: {description: Switched or delegated context rejected}
 */
router.post('/', async (req, res) => {
  const body = createSymptomJournalSchema.safeParse(req.body);
  if (!body.success || Object.keys(req.query).length) return invalid(res);
  res
    .status(201)
    .json(await service.create(req.userId, req.authenticatedUserId, body.data));
});
/**
 * @swagger
 * /v2/symptom-journal/search:
 *   post:
 *     summary: Search only the authenticated owner's journal
 *     tags: [HealthPilot Symptom Journal]
 *     security: [{cookieAuth: []}, {apiKeyAuth: []}]
 *     description: JSON body accepts symptom_name, body_location, status, from/to calendar days, limit (1–100), offset (0–10000). Dates use the owner's timezone. Filters must not be placed in the URL.
 *     responses:
 *       200: {description: Entries sorted by start time descending and has_more}
 *       400: {description: Invalid filters}
 */
router.post('/search', async (req, res) => {
  const body = searchSymptomJournalSchema.safeParse(req.body);
  if (!body.success || Object.keys(req.query).length) return invalid(res);
  res.json(
    await service.search(req.userId, req.authenticatedUserId, body.data)
  );
});
router.use('/:id', (req, res, next) => {
  if (!symptomJournalIdSchema.safeParse(req.params).success)
    return invalid(res);
  next();
});
/**
 * @swagger
 * /v2/symptom-journal/{id}:
 *   parameters:
 *     - {in: path, name: id, required: true, schema: {type: string, format: uuid}}
 *   get:
 *     summary: Get an owned symptom event
 *     tags: [HealthPilot Symptom Journal]
 *     security: [{cookieAuth: []}, {apiKeyAuth: []}]
 *     responses:
 *       200: {description: Event}
 *       404: {description: Missing or not owned}
 *   put:
 *     summary: Replace structured fields using the current version; preserve original text
 *     tags: [HealthPilot Symptom Journal]
 *     security: [{cookieAuth: []}, {apiKeyAuth: []}]
 *     responses:
 *       200: {description: Updated event and incremented version}
 *       400: {description: Invalid body}
 *       404: {description: Missing or not owned}
 *       409: {description: Version conflict; reload before retrying}
 *   delete:
 *     summary: Permanently delete an owned event at the supplied version
 *     tags: [HealthPilot Symptom Journal]
 *     security: [{cookieAuth: []}, {apiKeyAuth: []}]
 *     parameters:
 *       - {in: query, name: version, required: true, schema: {type: integer, minimum: 1}}
 *     responses:
 *       204: {description: Deleted}
 *       404: {description: Missing or not owned}
 *       409: {description: Version conflict}
 */
router.get('/:id', async (req, res) => {
  if (Object.keys(req.query).length) return invalid(res);
  res.json(
    await service.get(
      req.userId,
      req.authenticatedUserId,
      String(req.params.id)
    )
  );
});
router.put('/:id', async (req, res) => {
  const body = updateSymptomJournalSchema.safeParse(req.body);
  if (!body.success || Object.keys(req.query).length) return invalid(res);
  res.json(
    await service.mutate(
      req.userId,
      req.authenticatedUserId,
      String(req.params.id),
      body.data.version,
      body.data
    )
  );
});
router.delete('/:id', async (req, res) => {
  const query = symptomJournalVersionSchema.safeParse(req.query);
  if (!query.success) return invalid(res);
  await service.mutate(
    req.userId,
    req.authenticatedUserId,
    String(req.params.id),
    query.data.version
  );
  res.status(204).end();
});
router.use((_req, res) => {
  res.status(404).json({ error: 'Not found.', code: 'NOT_FOUND' });
});
const handleJournalError: express.ErrorRequestHandler = (
  error: unknown,
  _req,
  res,
  next
) => {
  if (error instanceof SymptomJournalError) {
    res.status(error.status).json({ error: error.code, code: error.code });
  } else next(error);
};
router.use(handleJournalError);
export default router;
