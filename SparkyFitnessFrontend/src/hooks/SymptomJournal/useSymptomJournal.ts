import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import {
  createJournalEntry,
  updateJournalEntry,
  deleteJournalEntry,
  searchJournal,
} from '@/api/SymptomJournal/symptomJournalService';
import type {
  CreateSymptomJournal,
  UpdateSymptomJournal,
  SearchSymptomJournal,
} from '@workspace/shared';

export function useSymptomJournal(filters: SearchSymptomJournal) {
  const { user } = useAuth();
  const client = useQueryClient();
  const key = ['healthpilot-symptom-journal', user?.id];
  const allowed = !!user && user.activeUserId === user.id;
  const requireOwner = () => {
    if (!allowed) throw new Error('Owner context required.');
  };
  const refresh = () => client.invalidateQueries({ queryKey: key });
  const list = useQuery({
    queryKey: [...key, filters],
    queryFn: () => searchJournal(filters),
    enabled: allowed,
    gcTime: 0,
  });
  const save = useMutation({
    mutationFn: (
      input:
        | { id: string; body: UpdateSymptomJournal }
        | { body: CreateSymptomJournal }
    ) => {
      requireOwner();
      return 'id' in input
        ? updateJournalEntry(input.id, input.body)
        : createJournalEntry(input.body);
    },
    onSuccess: refresh,
    gcTime: 0,
  });
  const remove = useMutation({
    mutationFn: (input: { id: string; version: number }) => {
      requireOwner();
      return deleteJournalEntry(input.id, input.version);
    },
    onSuccess: refresh,
    gcTime: 0,
  });
  return { list, save, remove };
}
