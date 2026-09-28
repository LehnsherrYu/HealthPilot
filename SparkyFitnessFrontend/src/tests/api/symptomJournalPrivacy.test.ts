import { apiCall } from '@/api/api';
import { getUserLoggingLevel } from '@/utils/userPreferences';
jest.mock('@/hooks/use-toast', () => ({ toast: jest.fn() }));
jest.mock('@/utils/userPreferences', () => ({
  getUserLoggingLevel: jest.fn(() => 'DEBUG'),
}));
const sentinel = 'PRIVATE_SENTINEL';
beforeEach(() => {
  global.fetch = jest.fn();
});
it('never writes journal requests or responses to console at DEBUG', async () => {
  const spies = [
    jest.spyOn(console, 'debug'),
    jest.spyOn(console, 'error'),
    jest.spyOn(console, 'warn'),
    jest.spyOn(console, 'info'),
  ].map((spy) => spy.mockImplementation(() => {}));
  try {
    jest.mocked(global.fetch).mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => 'application/json' },
      text: async () => JSON.stringify({ raw_text: sentinel }),
    } as unknown as Response);
    await apiCall('/v2/symptom-journal/search', {
      method: 'POST',
      body: { symptom_name: sentinel },
    });
    expect(jest.mocked(getUserLoggingLevel)()).toBe('DEBUG');
    for (const spy of spies) expect(spy).not.toHaveBeenCalled();
  } finally {
    spies.forEach((spy) => spy.mockRestore());
  }
});
it('sanitizes server and network errors before global query logging', async () => {
  jest.mocked(global.fetch).mockResolvedValue({
    ok: false,
    status: 500,
    headers: { get: () => 'application/json' },
    json: async () => ({ error: sentinel, code: sentinel }),
  } as unknown as Response);
  await expect(apiCall('/v2/symptom-journal')).rejects.toMatchObject({
    message: 'Journal request failed.',
    code: 'JOURNAL_ERROR',
  });
  jest.mocked(global.fetch).mockRejectedValue(new Error(sentinel));
  try {
    await apiCall('/v2/symptom-journal');
  } catch (error) {
    expect(error).toMatchObject({ message: 'Journal request failed.' });
    expect(error).not.toHaveProperty('cause');
  }
});
