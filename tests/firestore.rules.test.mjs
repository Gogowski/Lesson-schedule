import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { after, before, beforeEach, test } from 'node:test';
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing';

const EDITOR_UID = 'editor-test-user';
const VIEWER_UID = 'viewer-test-user';
const scheduleRefPath = ['schedules', 'current'];
const validSchedule = {
  version: 1,
  updatedAt: new Date().toISOString(),
  lessons: [{ id: 'lesson-1', day: 'mon', startTime: '09:00', endTime: '09:45', subject: 'Test', teacherName: 'Teacher' }],
};

let testEnvironment;

before(async () => {
  const sourceRules = await readFile(new URL('../firestore.rules', import.meta.url), 'utf8');
  const rules = sourceRules
    .replaceAll('REPLACE_WITH_EDITOR_UID', EDITOR_UID)
    .replaceAll('REPLACE_WITH_VIEWER_UID', VIEWER_UID);
  testEnvironment = await initializeTestEnvironment({
    projectId: 'demo-lesson-schedule',
    firestore: { rules },
  });
});

beforeEach(async () => {
  await testEnvironment.clearFirestore();
});

after(async () => {
  await testEnvironment?.cleanup();
});

async function seedSchedule() {
  await testEnvironment.withSecurityRulesDisabled(async (context) => {
    await context.firestore().doc(scheduleRefPath.join('/')).set(validSchedule);
  });
}

test('unauthenticated and unapproved users cannot read the schedule', async () => {
  await seedSchedule();
  const anonymousDb = testEnvironment.unauthenticatedContext().firestore();
  const outsiderDb = testEnvironment.authenticatedContext('outsider-user').firestore();

  await assertFails(anonymousDb.doc(scheduleRefPath.join('/')).get());
  await assertFails(outsiderDb.doc(scheduleRefPath.join('/')).get());
});

test('the approved viewer can read but cannot write or delete', async () => {
  await seedSchedule();
  const viewerDb = testEnvironment.authenticatedContext(VIEWER_UID).firestore();
  const ref = viewerDb.doc(scheduleRefPath.join('/'));

  await assertSucceeds(ref.get());
  await assertFails(ref.set({ ...validSchedule, version: 2 }));
  await assertFails(ref.delete());
});

test('the editor can create and update a valid schedule', async () => {
  const editorDb = testEnvironment.authenticatedContext(EDITOR_UID).firestore();
  const ref = editorDb.doc(scheduleRefPath.join('/'));

  await assertSucceeds(ref.set(validSchedule));
  await assertSucceeds(ref.set({ ...validSchedule, version: 2 }));
});

test('the editor cannot write an invalid schedule or another document', async () => {
  const editorDb = testEnvironment.authenticatedContext(EDITOR_UID).firestore();
  const invalidScheduleRef = editorDb.doc(scheduleRefPath.join('/'));
  const otherDocumentRef = editorDb.doc('schedules/other');

  await assertFails(invalidScheduleRef.set({ version: 1, updatedAt: 'now', lessons: 'not-an-array' }));
  await assertFails(otherDocumentRef.set(validSchedule));
});
