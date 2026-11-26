import {useCallback, useMemo, useState} from 'react';
import {
  buildBriefSummaryBadge,
  EMPTY_DRAFT_BRIEF,
  formatSceneBriefContext,
  getBriefReferenceHandles,
  getNextReferenceHandle,
  hasDraftBriefContent,
  isDraftBriefActive,
  type DraftBriefState,
  type ReferenceEntry,
} from '../../../ui/aiAssistant.ts';
import type {NewReferenceEntryDraft} from '../../AiBriefModal.tsx';

const EMPTY_REFERENCE_HANDLES: readonly string[] = [];

export interface AiBriefController {
  brief: DraftBriefState;
  isBriefOpen: boolean;
  setIsBriefOpen: (open: boolean) => void;
  briefHasContent: boolean;
  briefIsActive: boolean;
  referenceHandles: readonly string[];
  activeReferenceHandles: readonly string[];
  activeBriefContext: string | undefined;
  briefSummaryLabel: string | undefined;
  handleAddReference: () => void;
  handleAddReferenceEntry: (draft: NewReferenceEntryDraft) => void;
  handleUpdateReference: (
    refId: string,
    patch: Partial<Pick<ReferenceEntry, 'handle' | 'label' | 'note' | 'attachment'>>
  ) => void;
  handleRemoveReference: (refId: string) => void;
  handleClearBrief: () => void;
  handleSetBriefEnabled: (enabled: boolean) => void;
  handleUpdateBriefSpecs: (specs: string) => void;
  handleUpdateBriefSubtext: (subtext: string) => void;
  replaceBrief: (nextBrief: DraftBriefState) => void;
  resetBrief: () => void;
}

export function useAiBriefController(): AiBriefController {
  const [brief, setBrief] = useState<DraftBriefState>(EMPTY_DRAFT_BRIEF);
  const [isBriefOpen, setIsBriefOpen] = useState<boolean>(false);

  const briefHasContent = useMemo(() => hasDraftBriefContent(brief), [brief]);
  const briefIsActive = useMemo(() => isDraftBriefActive(brief), [brief]);
  const referenceHandles = useMemo(() => getBriefReferenceHandles(brief), [brief]);
  const activeReferenceHandles = briefIsActive ? referenceHandles : EMPTY_REFERENCE_HANDLES;
  const activeBriefContext = useMemo(() => formatSceneBriefContext(brief), [brief]);
  const briefSummaryLabel = useMemo(() => buildBriefSummaryBadge(brief), [brief]);

  const handleAddReference = useCallback(() => {
    setBrief((prev) => ({
      ...prev,
      references: [
        ...prev.references,
        {
          id: `ref-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
          handle: getNextReferenceHandle(prev.references, 'text'),
          kind: 'text',
          label: '',
          note: '',
        },
      ],
    }));
  }, []);

  const handleAddReferenceEntry = useCallback((draft: NewReferenceEntryDraft) => {
    setBrief((prev) => ({
      ...prev,
      references: [
        ...prev.references,
        {
          id: `ref-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
          handle: getNextReferenceHandle(prev.references, draft.kind),
          kind: draft.kind,
          label: draft.label,
          note: draft.note ?? '',
          ...(draft.attachment ? {attachment: draft.attachment} : {}),
        },
      ],
    }));
  }, []);

  const handleUpdateReference = useCallback(
    (
      refId: string,
      patch: Partial<Pick<ReferenceEntry, 'handle' | 'label' | 'note' | 'attachment'>>
    ) => {
      setBrief((prev) => ({
        ...prev,
        references: prev.references.map((entry) =>
          entry.id === refId ? {...entry, ...patch} : entry
        ),
      }));
    },
    []
  );

  const handleRemoveReference = useCallback((refId: string) => {
    setBrief((prev) => {
      const target = prev.references.find((entry) => entry.id === refId);
      if (target?.attachment?.localMediaUrl) {
        URL.revokeObjectURL(target.attachment.localMediaUrl);
      }
      return {
        ...prev,
        references: prev.references.filter((entry) => entry.id !== refId),
      };
    });
  }, []);

  const handleClearBrief = useCallback(() => {
    setBrief((prev) => {
      for (const entry of prev.references) {
        if (entry.attachment?.localMediaUrl) {
          URL.revokeObjectURL(entry.attachment.localMediaUrl);
        }
      }
      return EMPTY_DRAFT_BRIEF;
    });
  }, []);

  const handleSetBriefEnabled = useCallback((enabled: boolean) => {
    setBrief((prev) => ({...prev, enabled}));
  }, []);

  const handleUpdateBriefSpecs = useCallback((specs: string) => {
    setBrief((prev) => ({...prev, specs}));
  }, []);

  const handleUpdateBriefSubtext = useCallback((subtext: string) => {
    setBrief((prev) => ({...prev, subtext}));
  }, []);

  const replaceBrief = useCallback((nextBrief: DraftBriefState) => {
    setBrief((prev) => {
      for (const entry of prev.references) {
        if (entry.attachment?.localMediaUrl) {
          URL.revokeObjectURL(entry.attachment.localMediaUrl);
        }
      }
      return {
        enabled: nextBrief.enabled !== false,
        references: Array.isArray(nextBrief.references) ? nextBrief.references : [],
        specs: typeof nextBrief.specs === 'string' ? nextBrief.specs : '',
        subtext: typeof nextBrief.subtext === 'string' ? nextBrief.subtext : '',
      };
    });
    setIsBriefOpen(false);
  }, []);

  const resetBrief = useCallback(() => {
    handleClearBrief();
    setIsBriefOpen(false);
  }, [handleClearBrief]);

  return {
    brief,
    isBriefOpen,
    setIsBriefOpen,
    briefHasContent,
    briefIsActive,
    referenceHandles,
    activeReferenceHandles,
    activeBriefContext,
    briefSummaryLabel,
    handleAddReference,
    handleAddReferenceEntry,
    handleUpdateReference,
    handleRemoveReference,
    handleClearBrief,
    handleSetBriefEnabled,
    handleUpdateBriefSpecs,
    handleUpdateBriefSubtext,
    replaceBrief,
    resetBrief,
  };
}
