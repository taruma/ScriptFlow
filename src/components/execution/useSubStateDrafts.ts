import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type RefObject,
} from 'react';
import type {HistoryCommitMode} from '../../core/history.ts';
import type {ExecutionBeat} from '../../core/types.ts';
import {reconcileStepFocusOnDelete} from '../../ui/beatFocus.ts';
import {
  resolvePendingSubStateChange,
  resolvePendingSubStateKeyDown,
  resolveSubStateBlur,
  resolveSubStateChange,
  resolveSubStateKeyDown,
} from '../../ui/subStateKeyboard.ts';

interface PendingFocusTarget {
  type: 'step' | 'pending';
  index: number;
  caret: number;
  selectionEnd?: number;
}

export interface UseSubStateDraftsParams {
  beat: ExecutionBeat;
  historyRevision: number;
  readOnly: boolean;
  collapsed: boolean;
  autoFocusEdit: boolean;
  onClearAutoFocus?: () => void;
  onUpdateSubState: (
    beatIndex: number,
    subStateIndex: number,
    nextSubStateRaw: string,
    mode?: HistoryCommitMode
  ) => void;
  onInsertSubState: (
    beatIndex: number,
    afterSubStateIndex: number,
    starterText: string,
    mode?: HistoryCommitMode
  ) => void;
  onDeleteSubState: (beatIndex: number, subStateIndex: number) => void;
  onMergeSubState: (beatIndex: number, subStateIndex: number) => void;
  onReorderSubState: (
    beatIndex: number,
    fromSubStateIndex: number,
    toSubStateIndex: number
  ) => void;
}

export interface UseSubStateDraftsResult {
  focusedStepIndex: number | null;
  activeDraft: string;
  pendingAfterIndex: number | null;
  pendingDraft: string;
  isBeatFocused: boolean;
  pendingRef: RefObject<HTMLTextAreaElement | null>;
  registerStepRef: (index: number) => (el: HTMLTextAreaElement | null) => void;
  openPendingStepAfter: (afterIndex: number) => void;
  openPendingStepAtEnd: () => void;
  handleStepFocus: (index: number) => void;
  handleStepChange: (index: number, nextValue: string) => void;
  handleStepBlur: (index: number) => void;
  handleStepKeyDown: (index: number, event: KeyboardEvent<HTMLTextAreaElement>) => void;
  handleDeleteStep: (stepIdx: number) => void;
  handlePendingChange: (nextValue: string) => void;
  handlePendingBlur: () => void;
  handlePendingKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
}

/**
 * Manages active Sub-State draft state, `historyRevision` Undo/Redo resync,
 * queued focus + exact caret restoration, auto-focus on newly inserted Macro-States,
 * collapse focus clearing, and referentially stable waterfall editing handlers.
 */
export function useSubStateDrafts({
  beat,
  historyRevision,
  readOnly,
  collapsed,
  autoFocusEdit,
  onClearAutoFocus,
  onUpdateSubState,
  onInsertSubState,
  onDeleteSubState,
  onMergeSubState,
  onReorderSubState,
}: UseSubStateDraftsParams): UseSubStateDraftsResult {
  const [focusedStepIndex, setFocusedStepIndex] = useState<number | null>(null);
  const [activeDraft, setActiveDraft] = useState<string>('');
  const [pendingAfterIndex, setPendingAfterIndex] = useState<number | null>(null);
  const [pendingDraft, setPendingDraft] = useState<string>('');

  const stepRefs = useRef<Map<number, HTMLTextAreaElement>>(new Map());
  const stepRefCallbacks = useRef<Map<number, (el: HTMLTextAreaElement | null) => void>>(new Map());
  const pendingRef = useRef<HTMLTextAreaElement | null>(null);
  const nextFocusRef = useRef<PendingFocusTarget | null>(null);
  const lastHistoryRevisionRef = useRef<number>(historyRevision);

  const latestRef = useRef({
    beat,
    readOnly,
    focusedStepIndex,
    activeDraft,
    pendingAfterIndex,
    pendingDraft,
    onUpdateSubState,
    onInsertSubState,
    onDeleteSubState,
    onMergeSubState,
    onReorderSubState,
  });

  // Sync latest snapshot before focus restoration so synchronous `onFocus` sees fresh state
  useLayoutEffect(() => {
    latestRef.current = {
      beat,
      readOnly,
      focusedStepIndex,
      activeDraft,
      pendingAfterIndex,
      pendingDraft,
      onUpdateSubState,
      onInsertSubState,
      onDeleteSubState,
      onMergeSubState,
      onReorderSubState,
    };
  });

  // Apply queued focus + exact caret position right after React commits DOM updates
  useLayoutEffect(() => {
    const target = nextFocusRef.current;
    if (!target) return;

    if (target.type === 'pending') {
      const el = pendingRef.current;
      if (el) {
        nextFocusRef.current = null;
        el.focus();
        const pos = Math.min(target.caret, el.value.length);
        el.setSelectionRange(pos, pos);
      }
      return;
    }

    const el = stepRefs.current.get(target.index);
    if (el) {
      nextFocusRef.current = null;
      el.focus();
      const start = Math.min(target.caret, el.value.length);
      const end =
        target.selectionEnd !== undefined ? Math.min(target.selectionEnd, el.value.length) : start;
      el.setSelectionRange(start, end);
    }
  });

  const registerStepRef = useCallback((index: number) => {
    let callback = stepRefCallbacks.current.get(index);
    if (!callback) {
      callback = (el: HTMLTextAreaElement | null) => {
        if (el) {
          stepRefs.current.set(index, el);
        } else {
          stepRefs.current.delete(index);
        }
      };
      stepRefCallbacks.current.set(index, callback);
    }
    return callback;
  }, []);

  // Focus newly inserted beat immediately on the last step (e.g. "[ACT] ")
  useEffect(() => {
    if (!autoFocusEdit || collapsed) return;
    const lastIdx = Math.max(0, beat.subStates.length - 1);
    const initialText = beat.subStates[lastIdx]?.raw ?? '';
    setFocusedStepIndex(lastIdx);
    setActiveDraft(initialText);
    nextFocusRef.current = {type: 'step', index: lastIdx, caret: initialText.length};
    onClearAutoFocus?.();
  }, [autoFocusEdit, collapsed, beat.subStates, onClearAutoFocus]);

  // Clear local step focus when collapsed
  useEffect(() => {
    if (!collapsed) return;
    setFocusedStepIndex(null);
    setPendingAfterIndex(null);
    setPendingDraft('');
    nextFocusRef.current = null;
  }, [collapsed]);

  // Reconcile focus & active drafts on external sub-state shrink or Undo/Redo history jumps
  useEffect(() => {
    const isHistoryJump = lastHistoryRevisionRef.current !== historyRevision;
    lastHistoryRevisionRef.current = historyRevision;

    if (isHistoryJump && pendingAfterIndex !== null) {
      const targetIdx =
        beat.subStates.length > 0 ? Math.min(pendingAfterIndex, beat.subStates.length - 1) : null;
      setPendingAfterIndex(null);
      setPendingDraft('');
      if (targetIdx !== null) {
        const syncedRaw = beat.subStates[targetIdx]?.raw ?? '';
        setFocusedStepIndex(targetIdx);
        setActiveDraft(syncedRaw);
        nextFocusRef.current = {type: 'step', index: targetIdx, caret: syncedRaw.length};
      }
      return;
    }

    if (pendingAfterIndex !== null && pendingAfterIndex >= beat.subStates.length) {
      setPendingAfterIndex(null);
      setPendingDraft('');
    }

    if (focusedStepIndex !== null) {
      if (beat.subStates.length === 0) {
        setFocusedStepIndex(null);
        setActiveDraft('');
        return;
      }
      if (focusedStepIndex >= beat.subStates.length) {
        const clamped = beat.subStates.length - 1;
        const syncedRaw = beat.subStates[clamped]?.raw ?? '';
        setFocusedStepIndex(clamped);
        setActiveDraft(syncedRaw);
        if (isHistoryJump) {
          nextFocusRef.current = {type: 'step', index: clamped, caret: syncedRaw.length};
        }
        return;
      }
      if (isHistoryJump) {
        const syncedRaw = beat.subStates[focusedStepIndex]?.raw ?? '';
        setActiveDraft(syncedRaw);
      }
    }
  }, [historyRevision, beat.subStates, focusedStepIndex, pendingAfterIndex]);

  const openPendingStepAfter = useCallback((afterIndex: number) => {
    if (latestRef.current.readOnly) return;
    setFocusedStepIndex(null);
    setPendingAfterIndex(afterIndex);
    setPendingDraft('');
    nextFocusRef.current = {type: 'pending', index: afterIndex, caret: 0};
  }, []);

  const openPendingStepAtEnd = useCallback(() => {
    openPendingStepAfter(Math.max(0, latestRef.current.beat.subStates.length - 1));
  }, [openPendingStepAfter]);

  const handleStepFocus = useCallback((index: number) => {
    const {readOnly: isReadOnly, focusedStepIndex: currentFocused, beat: currentBeat} =
      latestRef.current;
    if (isReadOnly) return;
    setPendingAfterIndex(null);
    setPendingDraft('');
    if (currentFocused !== index) {
      setFocusedStepIndex(index);
      setActiveDraft(currentBeat.subStates[index]?.raw ?? '');
    }
  }, []);

  const handleDeleteStep = useCallback((stepIdx: number) => {
    const {
      readOnly: isReadOnly,
      beat: currentBeat,
      focusedStepIndex: currentFocused,
      activeDraft: currentDraft,
      pendingAfterIndex: currentPendingAfter,
      pendingDraft: currentPendingDraft,
      onDeleteSubState: deleteSubState,
    } = latestRef.current;
    if (isReadOnly) return;

    const subStateRaws = currentBeat.subStates.map((s) => s.raw);
    const activeEl =
      currentFocused !== null
        ? stepRefs.current.get(currentFocused)
        : currentPendingAfter !== null
          ? pendingRef.current
          : null;
    const currentCaret = activeEl?.selectionStart ?? undefined;

    const reconciled = reconcileStepFocusOnDelete(
      {
        focusedStepIndex: currentFocused,
        activeDraft: currentDraft,
        pendingAfterIndex: currentPendingAfter,
        pendingDraft: currentPendingDraft,
      },
      subStateRaws,
      stepIdx,
      currentCaret
    );

    setFocusedStepIndex(reconciled.focusedStepIndex);
    setActiveDraft(reconciled.activeDraft);
    setPendingAfterIndex(reconciled.pendingAfterIndex);
    if (reconciled.pendingAfterIndex === null && currentPendingAfter !== null) {
      setPendingDraft('');
    }
    nextFocusRef.current = reconciled.nextFocusTarget;
    deleteSubState(currentBeat.index, stepIdx);
  }, []);

  const handleStepChange = useCallback(
    (index: number, nextValue: string) => {
      const {readOnly: isReadOnly, beat: currentBeat, onUpdateSubState: updateSubState} =
        latestRef.current;
      if (isReadOnly) return;

      const action = resolveSubStateChange(index, nextValue);
      switch (action.kind) {
        case 'split_into_step':
          updateSubState(currentBeat.index, index, action.combinedText, action.commitMode);
          setFocusedStepIndex(action.nextFocusIndex);
          setActiveDraft(action.nextDraft);
          nextFocusRef.current = {
            type: 'step',
            index: action.nextFocusIndex,
            caret: action.nextCaret,
          };
          return;
        case 'split_into_pending':
          updateSubState(currentBeat.index, index, action.leftText, action.commitMode);
          openPendingStepAfter(action.pendingAfterIndex);
          return;
        case 'update':
          setActiveDraft(action.singleLine);
          if (action.shouldCommit) {
            updateSubState(currentBeat.index, index, action.singleLine, action.commitMode);
          }
          return;
      }
    },
    [openPendingStepAfter]
  );

  const handleStepBlur = useCallback((index: number) => {
    const {
      readOnly: isReadOnly,
      beat: currentBeat,
      focusedStepIndex: currentFocused,
      activeDraft: currentDraft,
      onDeleteSubState: deleteSubState,
      onUpdateSubState: updateSubState,
    } = latestRef.current;
    if (isReadOnly || currentFocused !== index) return;

    setFocusedStepIndex(null);
    const action = resolveSubStateBlur(currentDraft, currentBeat.subStates[index]?.raw ?? '');
    if (action.kind === 'delete') {
      deleteSubState(currentBeat.index, index);
    } else if (action.kind === 'commit') {
      updateSubState(currentBeat.index, index, action.text, action.commitMode);
    }
  }, []);

  const handleStepKeyDown = useCallback(
    (index: number, event: KeyboardEvent<HTMLTextAreaElement>) => {
      const {
        readOnly: isReadOnly,
        beat: currentBeat,
        focusedStepIndex: currentFocused,
        activeDraft: currentDraft,
        onUpdateSubState: updateSubState,
        onDeleteSubState: deleteSubState,
        onMergeSubState: mergeSubState,
        onReorderSubState: reorderSubState,
      } = latestRef.current;

      const el = event.currentTarget;
      const caretStart = el.selectionStart ?? 0;
      const caretEnd = el.selectionEnd ?? 0;
      const currentText =
        currentFocused === index ? currentDraft : (currentBeat.subStates[index]?.raw ?? '');

      const action = resolveSubStateKeyDown({
        key: event.key,
        altKey: event.altKey,
        ctrlKey: event.ctrlKey,
        metaKey: event.metaKey,
        shiftKey: event.shiftKey,
        readOnly: isReadOnly,
        index,
        subStateRaws: currentBeat.subStates.map((s) => s.raw),
        currentText,
        caretStart,
        caretEnd,
      });

      switch (action.kind) {
        case 'noop':
          return;
        case 'prevent_only':
          event.preventDefault();
          return;
        case 'blur':
          event.preventDefault();
          el.blur();
          return;
        case 'reorder':
          event.preventDefault();
          setFocusedStepIndex(action.toIndex);
          setActiveDraft(action.nextDraft);
          nextFocusRef.current = {
            type: 'step',
            index: action.toIndex,
            caret: action.caret,
            selectionEnd: action.selectionEnd,
          };
          reorderSubState(currentBeat.index, action.fromIndex, action.toIndex);
          return;
        case 'enter_split':
          event.preventDefault();
          updateSubState(currentBeat.index, index, action.combinedText, action.commitMode);
          setFocusedStepIndex(action.nextFocusIndex);
          setActiveDraft(action.nextDraft);
          nextFocusRef.current = {
            type: 'step',
            index: action.nextFocusIndex,
            caret: action.nextCaret,
          };
          return;
        case 'enter_open_pending':
          event.preventDefault();
          if (action.shouldCommitBefore && action.beforeText !== null) {
            updateSubState(currentBeat.index, index, action.beforeText, action.commitMode);
          }
          openPendingStepAfter(action.pendingAfterIndex);
          return;
        case 'backspace_delete_empty':
          event.preventDefault();
          deleteSubState(currentBeat.index, index);
          setFocusedStepIndex(action.targetIndex);
          setActiveDraft(action.nextDraft);
          nextFocusRef.current = {
            type: 'step',
            index: action.targetIndex,
            caret: action.nextCaret,
          };
          return;
        case 'backspace_merge':
          event.preventDefault();
          mergeSubState(currentBeat.index, index);
          setFocusedStepIndex(action.targetIndex);
          setActiveDraft(action.nextDraft);
          nextFocusRef.current = {
            type: 'step',
            index: action.targetIndex,
            caret: action.nextCaret,
          };
          return;
        case 'navigate':
          event.preventDefault();
          setFocusedStepIndex(action.targetIndex);
          setActiveDraft(action.nextDraft);
          nextFocusRef.current = {
            type: 'step',
            index: action.targetIndex,
            caret: action.nextCaret,
          };
          return;
      }
    },
    [openPendingStepAfter]
  );

  const handlePendingChange = useCallback((nextValue: string) => {
    const {
      readOnly: isReadOnly,
      beat: currentBeat,
      pendingAfterIndex: currentPendingAfter,
      onInsertSubState: insertSubState,
    } = latestRef.current;
    if (isReadOnly) return;

    const action = resolvePendingSubStateChange(nextValue, currentPendingAfter);
    if (action.kind === 'insert') {
      insertSubState(currentBeat.index, action.insertAfter, action.text, action.commitMode);
      setPendingAfterIndex(null);
      setPendingDraft('');
      setFocusedStepIndex(action.newStepIndex);
      setActiveDraft(action.text);
      nextFocusRef.current = {type: 'step', index: action.newStepIndex, caret: action.nextCaret};
      return;
    }

    setPendingDraft(action.singleLine);
  }, []);

  const handlePendingBlur = useCallback(() => {
    if (latestRef.current.pendingDraft.trim().length === 0) {
      setPendingAfterIndex(null);
      setPendingDraft('');
    }
  }, []);

  const handlePendingKeyDown = useCallback((event: KeyboardEvent<HTMLTextAreaElement>) => {
    const {
      beat: currentBeat,
      pendingDraft: currentPendingDraft,
      pendingAfterIndex: currentPendingAfter,
    } = latestRef.current;

    const action = resolvePendingSubStateKeyDown(
      event.key,
      currentPendingDraft,
      currentPendingAfter,
      currentBeat.subStates.map((s) => s.raw)
    );

    if (action.kind === 'close') {
      event.preventDefault();
      setPendingAfterIndex(null);
      setPendingDraft('');
      return;
    }

    if (action.kind === 'return_to_step') {
      event.preventDefault();
      setPendingAfterIndex(null);
      setPendingDraft('');
      setFocusedStepIndex(action.targetIndex);
      setActiveDraft(action.nextDraft);
      nextFocusRef.current = {
        type: 'step',
        index: action.targetIndex,
        caret: action.nextCaret,
      };
    }
  }, []);

  return {
    focusedStepIndex,
    activeDraft,
    pendingAfterIndex,
    pendingDraft,
    isBeatFocused: focusedStepIndex !== null || pendingAfterIndex !== null,
    pendingRef,
    registerStepRef,
    openPendingStepAfter,
    openPendingStepAtEnd,
    handleStepFocus,
    handleStepChange,
    handleStepBlur,
    handleStepKeyDown,
    handleDeleteStep,
    handlePendingChange,
    handlePendingBlur,
    handlePendingKeyDown,
  };
}
