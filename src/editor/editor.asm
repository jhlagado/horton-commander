; Native ATOM dependency order preserves the standalone COM layout.
%INCLUDE "editor-memory.asm"
%INCLUDE "editor-prologue.asm"
%INCLUDE "editor-bdos.asm"
%INCLUDE "editor-command.asm"
%INCLUDE "editor-document.asm"
%INCLUDE "editor-load.asm"
%INCLUDE "editor-buffer.asm"
%INCLUDE "editor-navigation.asm"
%INCLUDE "editor-layout.asm"
%INCLUDE "editor-screen.asm"
%INCLUDE "editor-save.asm"
%INCLUDE "editor-session.asm"
%INCLUDE "editor-main.asm"

; EditorCodeEnd
CODEEND:

; EditorImmutableStart
IMMSTA:
; EditorBackupExtension
BACEXT:    DB "BAK"
; EditorTemporaryExtension
TEMEXT: DB "$$$"
; EditorErrorPrefix
ERRPRE:        DB 13,10,"EDIT error ","$"
; EditorNewline
NEWLINE:            DB 13,10,"$"
; EditorClearHome
CLEHOM:          DB 27,"[0m",27,"[2J",27,"[H","$"
; EditorStatusPosition
STAPOS:     DB 27,"[24;1H",27,"[7m","$"
; EditorReverseOff
REVOFF:         DB 27,"[0m",27,"[","$"
; EditorCursorPrefix
CURPRE:       DB 27,"[","$"
; EditorEraseLine
ERALIN:          DB 27,"[K","$"
; EditorStatusPrefix
STAPRE:       DB "EDIT ",0
; EditorStatusHints
STAHIN:        DB "Arrows move  Enter new line  BS/Del  ^S save  ^Q quit",0
; EditorStatusDiscardHint
STADHINT:      DB "Other key keeps draft",0
; EditorStatusMessageHint
STAMHINT:      DB "Arrows Enter BS/Del ^S save ^Q quit",0
; EditorStatusSavedText
STASAVTE:    DB "Saved  ",0
; EditorStatusFullText
STAFULTE:     DB "Full  ",0
; EditorStatusDiscardText
STADISTE:  DB "Discard changes? ^Q again  ",0
; EditorStatusSaveFailedText
STASAVFA: DB "Save failed ",0
; EditorDefaultName
DEFNAM:        DB 0,"INPUT   ","NU "
; EditorImmutableEnd
IMMEND:
; EditorResidentEnd
RESEND:
