; Recoverable save using NAME.$$$ and NAME.BAK.

; EditorSaveCodeStart
SAVCODST:
;@ROUTINE out A,carry,zero clobbers sign,parity,halfCarry,BC,DE,HL
; EditorSave
SAVE:
            XOR  A
            LD   (SAVSTA),A
            CALL SAVSETTE
            CALL SAVREQAB
            JR   C,SAVCON
            CALL SAVSETBA
            CALL SAVREQAB
            JR   NC,SAVPRERE
; EditorSaveConflict
SAVCON:
            LD   A,STASAVCO
            JP   SAVEFAIL
; EditorSavePreflightReady
SAVPRERE:
            CALL SAVSETTE
            LD   C,22
            CALL TRACAL
            INC  A
            JR   Z,SAVCREFA
            LD   A,1
            LD   (SAVSTA),A
            CALL SAVWRICO
            JR   C,SAVWRIFA
            LD   C,16
            CALL TRACAL
            INC  A
            JR   Z,SAVCLOFA
            LD   A,(FLAGS)
            RLCA
            JR   C,SAVINSTE
            CALL SAVCOPSE
            LD   HL,TRAFCB
            CALL SAVBUIRE
            LD   HL,$4142
            LD   (TRAFCB+25),HL
            LD   A,'K'
            LD   (TRAFCB+27),A
            LD   C,23
            CALL TRACAL
            INC  A
            JR   Z,SAVRENFA
            LD   A,3
            LD   (SAVSTA),A
; EditorSaveInstallTemporary
SAVINSTE:
            CALL SAVSETTE
            LD   HL,FCB
            CALL SAVBUIRE
            LD   C,23
            CALL TRACAL
            INC  A
            JR   Z,SAVRENFA
            LD   A,(SAVSTA)
            DEC  A
            JR   Z,SAVSUC
            LD   A,7
            LD   (SAVSTA),A
            CALL SAVSETBA
            LD   C,19
            CALL TRACAL
            INC  A
            JR   Z,SAVRENFA
; EditorSaveSuccess
SAVSUC:
            XOR  A
            LD   (SAVSTA),A
            LD   A,(FLAGS)
            AND  $74
            LD   (FLAGS),A
            LD   A,STASAV
            LD   (EDSTATUS),A
            OR   A
            RET
; EditorSaveCreateFailure
SAVCREFA:
            LD   A,STASAVCR
            JR   SAVEFAIL
; EditorSaveWriteFailure
SAVWRIFA:
            LD   A,STASAVWR
            JR   SAVEFAIL
; EditorSaveCloseFailure
SAVCLOFA:
            LD   A,STASAVCL
            JR   SAVEFAIL
; EditorSaveRenameFailure
SAVRENFA:
            LD   A,STASAVRE
; EditorSaveFail
SAVEFAIL:
            LD   (EDSTATUS),A
            CALL SAVROL
            SCF
            RET

;@ROUTINE out A,carry,zero clobbers sign,parity,halfCarry,BC,DE,HL
; EditorSaveRequireAbsent
SAVREQAB:
            LD   C,15
            CALL TRACAL
            INC  A
            JR   Z,SAVABS
            SCF
            RET
; EditorSaveAbsent
SAVABS:
            XOR  A
            RET

;@ROUTINE out A,carry,zero clobbers sign,parity,halfCarry,BC,DE,HL
; EditorSaveWriteContent
SAVWRICO:
            LD   HL,0
            LD   (SCRATCHA),HL
            LD   HL,(LENGTH)
            LD   (SCRATCHB),HL
; EditorSaveRecordLoop
SAVRECLO:
            LD   HL,(SCRATCHB)
            LD   A,H
            OR   L
            RET  Z
            LD   DE,128
            OR   A
            SBC  HL,DE
            JR   C,SAVSHOCO
            LD   HL,128
            JR   SAVCOURE
; EditorSaveShortCount
SAVSHOCO:
            ADD  HL,DE
; EditorSaveCountReady
SAVCOURE:
            LD   (SCRATCHC),HL
            LD   HL,(SCRATCHA)
            CALL DOCREASP
            RET  C
            PUSH HL
            LD   H,B
            LD   L,C
            LD   DE,(SCRATCHC)
            OR   A
            SBC  HL,DE
            POP  HL
            JR   C,SAVSTARE
            LD   A,(SCRATCHC)
            CP   128
            JR   NZ,SAVSTARE
            EX   DE,HL
            JR   SAVRECRE
; EditorSaveStageRecord
SAVSTARE:
            LD   HL,EDDMA
            LD   DE,EDDMA+1
            LD   BC,127
            LD   (HL),$1A
            LDIR
            LD   HL,(SCRATCHA)
            LD   DE,EDDMA
            LD   BC,(SCRATCHC)
            CALL DOCREARA
            RET  C
            LD   DE,EDDMA
; EditorSaveRecordReady
SAVRECRE:
            CALL SETDMA
            CALL SAVWRIRE
            RET  C
            LD   HL,(SCRATCHA)
            LD   DE,(SCRATCHC)
            ADD  HL,DE
            LD   (SCRATCHA),HL
            LD   HL,(SCRATCHB)
            OR   A
            SBC  HL,DE
            LD   (SCRATCHB),HL
            JR   SAVRECLO

;@ROUTINE out A,carry,zero clobbers sign,parity,halfCarry,BC,DE,HL
; EditorSaveWriteRecord
SAVWRIRE:
            LD   C,21
            CALL TRACAL
            OR   A
            RET  Z
            SCF
            RET

;@ROUTINE out A,carry,zero clobbers sign,parity,halfCarry,BC,DE,HL
; EditorSaveRollback
SAVROL:
            LD   A,(SAVSTA)
            OR   A
            RET  Z
            AND  4
            JR   Z,SAVROLTE
            CALL SAVCOPSE
            LD   C,19
            CALL TRACAL
; EditorSaveRollbackTemporary
SAVROLTE:
            CALL SAVSETTE
            LD   C,16
            CALL TRACAL
            CALL SAVSETTE
            LD   C,19
            CALL TRACAL
            LD   A,(SAVSTA)
            AND  2
            JR   Z,SAVROLDO
            CALL SAVSETBA
            LD   HL,FCB
            CALL SAVBUIRE
            LD   C,23
            CALL TRACAL
            INC  A
            JR   NZ,SAVROLDO
            LD   A,STASAVRO
            LD   (EDSTATUS),A
; EditorSaveRollbackDone
SAVROLDO:
            XOR  A
            LD   (SAVSTA),A
            RET

;@ROUTINE out A clobbers carry,zero,sign,parity,halfCarry,BC,DE,HL
; EditorSaveCopySelected
SAVCOPSE:
            LD   HL,FCB
            LD   DE,TRAFCB
            JP   BUILDFCB

;@ROUTINE out A clobbers carry,zero,sign,parity,halfCarry,BC,DE,HL
; EditorSaveSetTemporary
SAVSETTE:
            CALL SAVCOPSE
            LD   HL,$2424
            LD   A,'$'
            JR   SAVSETEX

;@ROUTINE out A clobbers carry,zero,sign,parity,halfCarry,BC,DE,HL
; EditorSaveSetBackup
SAVSETBA:
            CALL SAVCOPSE
            LD   HL,$4142
            LD   A,'K'

;@ROUTINE in A,HL out A clobbers carry,zero,sign,parity,halfCarry,BC,DE,HL
; EditorSaveSetExtension
SAVSETEX:
            LD   (TRAFCB+9),HL
            LD   (TRAFCB+11),A
            RET

;@ROUTINE in HL out A clobbers carry,zero,sign,parity,halfCarry,BC,DE,HL
; EditorSaveBuildRename
SAVBUIRE:
            LD   DE,TRAFCB+16
            LD   BC,12
            LDIR
            RET
; EditorSaveCodeEnd
SAVCODEN:
