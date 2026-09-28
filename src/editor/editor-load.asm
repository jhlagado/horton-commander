; Sequential text-file loader and validator.

; EditorLoadCodeStart
LOACODST:
;@ROUTINE out A,carry,zero clobbers sign,parity,halfCarry,BC,DE,HL
; EditorLoadFile
LOADFILE:
            XOR  A
            LD   (LOAPENCR),A
            CALL DOCRES
            LD   C,15
            CALL SELCAL
            INC  A
            JR   Z,LOANOTFO
            LD   DE,EDDMA
            CALL SETDMA
; EditorLoadRecord
LOAREC:
            LD   C,20
            CALL SELCAL
            OR   A
            JR   Z,LOASCARE
            DEC  A
            JR   Z,LOAPHYEO
            JR   LOASTO
; EditorLoadScanRecord
LOASCARE:
            LD   HL,EDDMA
            LD   B,128
; EditorLoadByte
LOADBYTE:
            LD   A,(HL)
            CP   $1A
            JR   Z,LOATEXEO
            CALL LOAVALBY
            JR   C,LOATEXER
            PUSH HL
            CALL LOAAPP
            POP  HL
            JR   C,LOACAP
            INC  HL
            DJNZ LOADBYTE
            JR   LOAREC
; EditorLoadTextEof
LOATEXEO:
            LD   A,(LOAPENCR)
            OR   A
            JR   NZ,LOATEXER
            JR   LOACLO
; EditorLoadPhysicalEof
LOAPHYEO:
            LD   A,(LOAPENCR)
            OR   A
            JR   NZ,LOATEXER
; EditorLoadClose
LOACLO:
            LD   C,16
            CALL SELCAL
            INC  A
            JR   Z,LOASTO
            XOR  A
; EditorLoadReset
LOARES:
            LD   HL,0
            ; Adjacent high bytes of horizontal and desired columns.
            LD   (HORHIG),HL
            LD   (CURSOR),HL
            LD   (TOP),HL
            LD   (HOR),HL
            LD   (DESCOL),HL
            LD   L,A
            LD   (FLAGS),HL
            RET
; EditorLoadNotFound
LOANOTFO:
            LD   A,(SAVSTA)
            OR   A
            CCF
            LD   A,ERRNOTFO
            RET  Z
            LD   A,FLADIR|FLAGNEW
            OR   A
            JR   LOARES
; EditorLoadTextError
LOATEXER:
            LD   A,ERRTEX
            SCF
            RET
; EditorLoadCapacity
LOACAP:
            LD   A,ERRCAP
            SCF
            RET
; EditorLoadStorage
LOASTO:
            LD   A,ERRSTO
            SCF
            RET

;@ROUTINE in A out A,carry,zero clobbers sign,parity,halfCarry,C
; EditorLoadValidateByte
LOAVALBY:
            LD   C,A
            LD   A,(LOAPENCR)
            OR   A
            JR   Z,LOAVALOR
            LD   A,C
            CP   10
            JR   NZ,LOAVALBA
            XOR  A
            LD   (LOAPENCR),A
            LD   A,C
            RET
; EditorLoadValidateOrdinary
LOAVALOR:
            LD   A,C
            CP   13
            JR   Z,LOAVALCR
            CP   9
            JR   Z,LOAVALGO
            CP   10
            JR   Z,LOAVALGO
            CP   32
            JR   C,LOAVALBA
            CP   127
            JR   NC,LOAVALBA
; EditorLoadValidateGood
LOAVALGO:
            OR   A
            RET
; EditorLoadValidateCr
LOAVALCR:
            LD   A,1
            LD   (LOAPENCR),A
            LD   A,C
            OR   A
            RET
; EditorLoadValidateBad
LOAVALBA:
            LD   A,C
            SCF
            RET

;@ROUTINE in A out A,carry,zero clobbers sign,parity,halfCarry,DE,HL
; EditorLoadAppend
LOAAPP:
            JP   DOCAPP
; EditorLoadCodeEnd
LOACODEN:
