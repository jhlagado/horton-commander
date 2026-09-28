; Fixed memory partition for the native CP/M editor.

; EditorCodeBase
CODEBASE       EQU $3400
; EditorCodeLimit
CODLIM      EQU $4C00
; EditorWorkspaceBase
WORBAS  EQU $4C00
; EditorWorkspaceLimit
WORLIM EQU $4E00
; EditorTextBase
TEXTBASE       EQU $4E00
; EditorTextLimit
TEXLIM      EQU $CE00
; EditorTextCapacity
TEXCAP   EQU TEXLIM-TEXTBASE
; EditorStackFloor
STAFLO     EQU $D800
; EditorStackTop
STACKTOP       EQU $E400

; EditorFcb
FCB            EQU WORBAS
; EditorTransactionFcb
TRAFCB EQU FCB+36
; EditorDma
EDDMA          EQU TRAFCB+36

; EditorLength
LENGTH         EQU EDDMA+128
; EditorCursor
CURSOR         EQU LENGTH+2
; EditorTop
TOP            EQU CURSOR+2
; EditorHorizontal
HOR     EQU TOP+2
; EditorDesiredColumn
DESCOL  EQU HOR+2
; EditorFlags
FLAGS          EQU DESCOL+2
; EditorStatus
EDSTATUS       EQU FLAGS+1
; Shared Edit core uses STATUS; keep the adapter-specific name as an alias.
STATUS         EQU EDSTATUS
; Track a carriage return that may be split across adjacent CP/M records.
; EditorLoadPendingCr
LOAPENCR  EQU EDSTATUS+1
; EditorSaveState
SAVSTA      EQU LOAPENCR+1
; EditorScratchA
SCRATCHA       EQU SAVSTA+1
; EditorScratchB
SCRATCHB       EQU SCRATCHA+2
; EditorScratchC
SCRATCHC       EQU SCRATCHB+2
; EditorRenderPointer
RENPOI  EQU SCRATCHC+2
; EditorRenderColumn
RENCOL   EQU RENPOI+2
; EditorRenderCount
RENCOU    EQU RENCOL+2
; EditorCursorScreenRow
CURSCRRO EQU RENCOU+2
; EditorCursorScreenColumn
CURSCRCO EQU CURSCRRO+1
; Visual columns need 19 bits at the full 47104-byte tab-only capacity.
; Keep low words in their existing slots; byte offsets remain 16-bit.
; EditorHorizontalHigh
HORHIG EQU CURSCRCO+1
; EditorDesiredColumnHigh
DESCOLHI EQU HORHIG+1
; EditorRenderColumnHigh
RENCOLHI EQU DESCOLHI+1
; EditorColumnHigh
COLHIG     EQU RENCOLHI+1
; EditorTargetColumnHigh
TARCOLHI EQU COLHIG+1
; EditorLegacyWorkspaceEnd
LEGWOREN EQU TARCOLHI+1

; Document-owned request, result and scratch. No session scratch is borrowed.
; EditorDocumentStart
DOCSTA       EQU LEGWOREN
; EditorDocumentRemove
DOCREM      EQU DOCSTA+2
; EditorDocumentInput
DOCINP       EQU DOCREM+2
; EditorDocumentInsert
DOCINS      EQU DOCINP+2
; EditorDocChangeStart
DOCCHAST       EQU DOCINS+2
; EditorDocChangeRemoved
DOCCHARE     EQU DOCCHAST+2
; EditorDocChangeInserted
DOCCHAIN    EQU DOCCHARE+2
; EditorDocChangeFlags
DOCCHAFL       EQU DOCCHAIN+2
; EditorDocumentEnd
DOCEND         EQU DOCCHAFL+1
; EditorDocumentNewLength
DOCNEWLE   EQU DOCEND+2
; EditorDocumentTail
DOCTAI        EQU DOCNEWLE+2
; EditorDocumentWorkFlags
DOCWORFL   EQU DOCTAI+2
; EditorDocumentRangeOffset
DOCRANOF EQU DOCWORFL+1
; EditorDocumentRangeTarget
DOCRANTA EQU DOCRANOF+2
; EditorDocumentRangeCount
DOCRANCO  EQU DOCRANTA+2
; EditorDocumentMatchOffset
DOCMATOF EQU DOCRANCO+2
; EditorDocumentMatchInput
DOCMATIN  EQU DOCMATOF+2
; EditorDocumentMatchCount
DOCMATCO  EQU DOCMATIN+2
; Arena-relative gap bounds: [GapStart, GapEnd) is unused storage.
; EditorDocumentGapStart
DOCGAPST    EQU DOCMATCO+1
; EditorDocumentGapEnd
DOCGAPEN      EQU DOCGAPST+2
; EditorDocumentPendingChanges
DOCPENCH EQU DOCGAPEN+2
; EditorDocumentWorkspaceEnd
DOCWOREN EQU DOCPENCH+1

; EditorDocumentErrorRange
DOCERRRA    EQU 1
; EditorDocumentErrorText
DOCERRTE     EQU 2
; EditorDocumentErrorCapacity
DOCERRCA EQU 3
; EditorDocumentErrorAlias
DOCERRAL    EQU 4

; EditorSessionOpcode
SESOPC EQU DOCWOREN
; EditorSessionByte
SESBYT EQU SESOPC+1
; EditorSessionOldCursor
SESOLDCU EQU SESBYT+1
; EditorSessionOldFlags
SESOLDFL EQU SESOLDCU+2
; EditorSessionOldStatus
SESOLDST EQU SESOLDFL+1
; EditorSessionOutcome
SESOUT EQU SESOLDST+1
; EditorSessionResultFlags
SESRESFL EQU SESOUT+1
; EditorSessionWorkspaceEnd
SESWOREN EQU SESRESFL+1

; Bounded viewport cache. No scratch here is shared with prompts or BDOS.
; EditorLayoutBoundaries
LAYBOU EQU SESWOREN
; EditorLayoutAnchors
LAYANC EQU LAYBOU+48
; Each anchor: word logical offset + phase0..7 relative to OriginHorizontal;
; or word end-column + tag$80|high3; $FF means undiscovered.
; EditorLayoutCursor
LAYCUR EQU LAYANC+69
; EditorLayoutColumn
LAYCOL EQU LAYCUR+2
; EditorLayoutCursorRow
LAYCURRO EQU LAYCOL+3
; EditorLayoutOriginHorizontal
LAYORIHO EQU LAYCURRO+1
; EditorLayoutOriginTop
LAYORITO EQU LAYORIHO+3
; EditorLayoutRowCount
LAYROWCO EQU LAYORITO+2
; EditorLayoutFlags
LAYFLA EQU LAYROWCO+1
; EditorLayoutRowEnd
LAYROWEN EQU LAYFLA+1
; EditorLayoutScanPointer
LAYSCAPO EQU LAYROWEN+2
; EditorLayoutScanColumn
LAYSCACO EQU LAYSCAPO+2
; EditorLayoutIndex
LAYIND EQU LAYSCACO+3
; EditorLayoutDamage
LAYDAM EQU LAYIND+1
; EditorLayoutFirst
LAYFIR EQU LAYDAM+1
; EditorLayoutDelta
LAYDEL EQU LAYFIR+1
; EditorLayoutWorkspaceEnd
LAYWOREN EQU LAYDEL+2

; EditorDisplayLastFlags
DISLASFL EQU LAYWOREN
; EditorDisplayLastStatus
DISLASST EQU DISLASFL+1
; EditorDisplayStatusValid
DISSTAVA EQU DISLASST+1
; EditorDisplayRow
DISROW EQU DISSTAVA+1
; EditorDisplayEndRow
DISENDRO EQU DISROW+1
; EditorWorkspaceEnd
WOREND EQU DISENDRO+1

; EditorOpInsert
OPINSERT EQU 0
; EditorOpNewline
OPNEW EQU 1
; EditorOpBackspace
OPBAC EQU 2
; EditorOpDelete
OPDELETE EQU 3
; EditorOpLeft
OPLEFT EQU 4
; EditorOpRight
OPRIGHT EQU 5
; EditorOpUp
OPUP EQU 6
; EditorOpDown
OPDOWN EQU 7
; EditorFlagDirty
FLADIR        EQU 1
; EditorFlagConfirmQuit
FLACONQU  EQU 2
; EditorFlagDesiredValid
FLADESVA EQU 4
; EditorFlagNew
FLAGNEW          EQU $80

; EditorStatusReady
STAREA       EQU 0
; EditorStatusSaved
STASAV       EQU 1
; EditorStatusFull
STAFUL        EQU 2
; EditorStatusBoundary
STABOU    EQU 3
; EditorStatusDiscard
STADIS     EQU 4
; EditorStatusSaveConflict
STASAVCO EQU $10
; EditorStatusSaveCreate
STASAVCR  EQU $11
; EditorStatusSaveWrite
STASAVWR   EQU $12
; EditorStatusSaveClose
STASAVCL   EQU $13
; EditorStatusSaveRename
STASAVRE  EQU $14
; EditorStatusSaveRollback
STASAVRO EQU $15

; EditorErrorCommand
ERRCOM  EQU 1
; EditorErrorNotFound
ERRNOTFO EQU 2
; EditorErrorText
ERRTEX     EQU 3
; EditorErrorCapacity
ERRCAP EQU 4
; EditorErrorStorage
ERRSTO  EQU 5
