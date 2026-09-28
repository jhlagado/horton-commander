; Transient entry, raw-key dispatcher, and CCP return.

; EditorMainCodeStart
MAICODST:
;@ROUTINE out A,carry,zero clobbers sign,parity,halfCarry,BC,DE,HL,IX,IY
; EditorEntry
EDENTRY:
            LD   (EDRESSP+1),SP
            LD   SP,STACKTOP
            XOR  A
            LD   (SAVSTA),A
            CALL LOADFILE
            JR   NC,EDOPENOK
            CALL RUNERROR
            CALL READBYTE
            JP   EDRESSP
EDOPENOK:
            CALL RENDER
            JP   MAINLOOP
; EditorRestoreSp
EDRESSP:
            LD   SP,0
            RET

; EditorMainLoop
MAINLOOP:
            CALL READBYTE
            CP   17
            JP   Z,COMQUI
            PUSH AF
            LD   A,(FLAGS)
            AND  $FD
            LD   (FLAGS),A
            POP  AF
            CP   19
            JR   Z,COMSAV
            CP   27
            JR   Z,COMESC
            CP   13
            JR   Z,COMNEW
            CP   8
            JR   Z,COMBAC
            CP   127
            JR   Z,COMDEL
            CP   9
            JR   Z,COMINS
            CP   32
            JR   C,COMUNS
            CP   127
            JR   NC,COMUNS
; EditorCommandInsert
COMINS:
            LD   E,A
            LD   A,OPINSERT
            CALL SESEXE
            JR   COMCOM
; EditorCommandNewline
COMNEW:
            LD   A,OPNEW
            CALL SESEXE
            JR   COMCOM
; EditorCommandBackspace
COMBAC:
            LD   A,OPBAC
            CALL SESEXE
            JR   COMCOM
; EditorCommandDelete
COMDEL:
            LD   A,OPDELETE
            CALL SESEXE
            JR   COMCOM
; EditorCommandSave
COMSAV:
            CALL SAVE
            JR   COMCOM
; EditorCommandEscape
COMESC:
            CALL REAESCBY
            JR   C,COMUNS
            CP   '['
            JR   NZ,COMUNS
            CALL REAESCBY
            JR   C,COMUNS
            CP   'A'
            JR   Z,COMUP
            CP   'B'
            JR   Z,COMDOW
            CP   'C'
            JR   Z,COMRIG
            CP   'D'
            JR   NZ,COMUNS
            LD   A,OPLEFT
            CALL SESEXE
            JR   COMCOM
; EditorCommandUp
COMUP:
            LD   A,OPUP
            CALL SESEXE
            JR   COMCOM
; EditorCommandDown
COMDOW:
            LD   A,OPDOWN
            CALL SESEXE
            JR   COMCOM
; EditorCommandRight
COMRIG:
            LD   A,OPRIGHT
            CALL SESEXE
            JR   COMCOM
; EditorCommandUnsupported
COMUNS:
            CALL BUFBOU
; EditorCommandComplete
COMCOM:
            JR   NC,COMREN
            LD   A,7
            CALL OUTBYT
; EditorCommandRender
COMREN:
            CALL PRESENT
            JP   MAINLOOP

; EditorCommandQuit
COMQUI:
            LD   A,(FLAGS)
            AND  FLADIR
            JR   Z,COMEXI
            LD   A,(FLAGS)
            AND  FLACONQU
            JR   NZ,COMEXI
            LD   A,(FLAGS)
            OR   FLACONQU
            LD   (FLAGS),A
            LD   A,STADIS
            LD   (EDSTATUS),A
            CALL PRESENT
            JP   MAINLOOP
; EditorCommandExit
COMEXI:
            LD   DE,CLEHOM
            CALL OUTTEX
            JP   EDRESSP

; EditorRunError
RUNERROR:
            PUSH AF
            LD   DE,ERRPRE
            CALL OUTTEX
            POP  AF
            PUSH AF
            RRCA
            RRCA
            RRCA
            RRCA
            CALL PRIHEXNI
            POP  AF
            CALL PRIHEXNI
            LD   DE,NEWLINE
            JP   OUTTEX

;@ROUTINE out A,carry,zero clobbers sign,parity,halfCarry,BC,DE,HL
; EditorReadByte
READBYTE:
            LD   DE,$00FF
            LD   C,6
            CALL CALLBDOS
            OR   A
            JR   Z,READBYTE
            RET

;@ROUTINE out A,carry,zero clobbers sign,parity,halfCarry,BC,DE,HL
; EditorReadEscapeByte
REAESCBY:
            LD   HL,256
            LD   (SCRATCHA),HL
; EditorReadEscapeLoop
REAESCLO:
            LD   DE,$00FF
            LD   C,6
            CALL CALLBDOS
            OR   A
            RET  NZ
            LD   HL,(SCRATCHA)
            DEC  HL
            LD   (SCRATCHA),HL
            LD   A,H
            OR   L
            JR   NZ,REAESCLO
            SCF
            RET

;@ROUTINE in A out A,carry,zero clobbers sign,parity,halfCarry,BC,DE,HL
; EditorPrintHexNibble
PRIHEXNI:
            AND  $0F
            ADD  A,'0'
            CP   '9'+1
            JP   C,OUTBYT
            ADD  A,7
            JP   OUTBYT
; EditorMainCodeEnd
MAICODEN:
