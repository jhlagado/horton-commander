; Synchronous semantic command boundary. No console, file or rendering calls.
; One request/result is live at a time. Result flags: content=1, cursor=2,
; status/session-flags=4, failure=8. The document change record carries ranges.
; EditorSessionCodeStart
SESCODST:
;@ROUTINE in A,E out A,carry,zero clobbers sign,parity,halfCarry,BC,DE,HL
; EditorSessionExecute
SESEXE:
            LD   (SESOPC),A
            LD   A,E
            LD   (SESBYT),A
            LD   HL,(CURSOR)
            LD   (SESOLDCU),HL
            LD   A,(FLAGS)
            LD   (SESOLDFL),A
            AND  $FD
            LD   (FLAGS),A
            LD   A,(EDSTATUS)
            LD   (SESOLDST),A
            XOR  A
            LD   (DOCCHAFL),A
            LD   (SESRESFL),A
            CALL SESDIS
            PUSH AF
            LD   (SESOUT),A
            LD   A,0
            ADC  A,A
            ADD  A,A
            ADD  A,A
            ADD  A,A
            LD   B,A
            LD   A,(DOCCHAFL)
            AND  1
            OR   B
            LD   B,A
            LD   HL,(CURSOR)
            LD   DE,(SESOLDCU)
            OR   A
            SBC  HL,DE
            JR   Z,SESCURSA
            SET  1,B
; EditorSessionCursorSame
SESCURSA:
            LD   A,(FLAGS)
            LD   C,A
            LD   A,(SESOLDFL)
            CP   C
            JR   NZ,SESSTACH
            LD   A,(EDSTATUS)
            LD   C,A
            LD   A,(SESOLDST)
            CP   C
            JR   Z,SESRESRE
; EditorSessionStatusChanged
SESSTACH:
            SET  2,B
; EditorSessionResultReady
SESRESRE:
            LD   A,B
            LD   (SESRESFL),A
            POP  AF
            RET

; EditorSessionDispatch
SESDIS:
            LD   A,(SESOPC)
            OR   A
            JR   Z,SESINS
            DEC  A
            JP   Z,BUFINSNE
            DEC  A
            JP   Z,BUFBAC
            DEC  A
            JP   Z,BUFDEL
            DEC  A
            JP   Z,MOVELEFT
            DEC  A
            JP   Z,MOVRIG
            DEC  A
            JP   Z,MOVEUP
            DEC  A
            JP   Z,MOVEDOWN
            JP   BUFBOU
; EditorSessionInsert
SESINS:
            LD   A,(SESBYT)
            JP   BUFINSBY
; EditorSessionCodeEnd
SESCODEN:
