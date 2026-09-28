; Logical-character movement and visual-column mapping.

; EditorNavigationCodeStart
NAVCODST:
;@ROUTINE out A,carry,zero clobbers sign,parity,halfCarry,DE,HL
; EditorMoveLeft
MOVELEFT:
            LD   HL,(CURSOR)
            LD   A,H
            OR   L
            JR   Z,BUFBOU
            DEC  HL
            PUSH HL
            CALL BUFBYTAT
            POP  HL
            CP   10
            JR   NZ,MOVLEFST
            LD   A,H
            OR   L
            JR   Z,MOVLEFST
            DEC  HL
            PUSH HL
            CALL BUFBYTAT
            POP  HL
            CP   13
            JR   Z,MOVLEFST
            INC  HL
; EditorMoveLeftStore
MOVLEFST:
            LD   (CURSOR),HL
            JR   NAVHORDO

;@ROUTINE out A,carry,zero clobbers sign,parity,halfCarry,DE,HL
; EditorMoveRight
MOVRIG:
            LD   HL,(CURSOR)
            PUSH HL
            CALL BUFBYTAT
            POP  HL
            JR   C,BUFBOU
            INC  HL
            CP   13
            JR   NZ,MOVRIGST
            INC  HL
; EditorMoveRightStore
MOVRIGST:
            LD   (CURSOR),HL
; EditorNavigationHorizontalDone
NAVHORDO:
            LD   A,(FLAGS)
            AND  $F9
            LD   (FLAGS),A
            XOR  A
            LD   (STATUS),A
            RET

;@ROUTINE out A,carry,zero clobbers sign,parity,halfCarry,BC,DE,HL
; EditorMoveUp
MOVEUP:
            CALL NAVPREVE
            LD   HL,(CURSOR)
            CALL NAVLINST
            LD   A,H
            OR   L
            JR   Z,BUFBOU
            DEC  HL
            CALL NAVLINST
            LD   DE,(DESCOL)
            LD   A,(DESCOLHI)
            CALL NAVOFFFO
            LD   (CURSOR),HL
            XOR  A
            LD   (STATUS),A
            RET

;@ROUTINE out A,carry,zero clobbers sign,parity,halfCarry,BC,DE,HL
; EditorMoveDown
MOVEDOWN:
            CALL NAVPREVE
            LD   HL,(CURSOR)
            CALL NAVLINST
            CALL NAVNEXLI
            JP   C,BUFBOU
            LD   DE,(DESCOL)
            LD   A,(DESCOLHI)
            CALL NAVOFFFO
            LD   (CURSOR),HL
            XOR  A
            LD   (STATUS),A
            RET

;@ROUTINE out A,carry,zero clobbers sign,parity,halfCarry,BC,DE,HL
; EditorNavigationPrepareVertical
NAVPREVE:
            LD   A,(FLAGS)
            AND  FLADESVA
            JR   NZ,NAVVERRE
            CALL NAVCURCO
            LD   (DESCOL),HL
            LD   (DESCOLHI),A
            LD   A,(FLAGS)
            OR   FLADESVA
            LD   (FLAGS),A
; EditorNavigationVerticalReady
NAVVERRE:
            LD   A,(FLAGS)
            AND  $FD
            LD   (FLAGS),A
            RET

;@ROUTINE in HL out HL,carry,zero clobbers sign,parity,halfCarry,A,DE
; EditorNavigationLineStart
NAVLINST:
            CALL LAYFINLI
            RET  NC
            LD   A,H
            OR   L
            RET  Z
; EditorNavigationLineStartLoop
NAVLINS2:
            DEC  HL
            PUSH HL
            CALL BUFBYTAT
            POP  HL
            CP   10
            JR   NZ,NAVLINS1
            INC  HL
            RET
; EditorNavigationLineStartContinue
NAVLINS1:
            LD   A,H
            OR   L
            JR   NZ,NAVLINS2
            RET

;@ROUTINE in HL out HL,carry,zero clobbers sign,parity,halfCarry,A,DE
; EditorNavigationNextLine
NAVNEXLI:
            CALL LAYNEXLI
            RET  Z
; EditorNavigationNextLineScan
NAVNEXL1:
            PUSH HL
            CALL BUFBYTAT
            POP  HL
            RET  C
            INC  HL
            CP   10
            JR   NZ,NAVNEXL1
            OR   A
            RET

; Return the visual column in A:HL (24 bits).
;@ROUTINE out A,HL,carry,zero clobbers sign,parity,halfCarry,BC,DE
; EditorNavigationCursorColumn
NAVCURCO:
            JP   LAYCURC1

;@ROUTINE out A,HL,carry,zero clobbers sign,parity,halfCarry,BC,DE
; EditorNavigationCursorColumnScan
NAVCURC1:
            XOR  A
            LD   (COLHIG),A
            LD   HL,(CURSOR)
            LD   (SCRATCHA),HL
            CALL NAVLINST
            LD   DE,0
; EditorNavigationColumnLoop
NAVCOLLO:
            PUSH HL
            LD   BC,(SCRATCHA)
            OR   A
            SBC  HL,BC
            POP  HL
            JR   Z,NAVCOLDO
            PUSH HL
            PUSH DE
            CALL BUFBYTAT
            POP  DE
            POP  HL
            JR   C,NAVCOLDO
            CP   9
            JR   Z,NAVCOLTA
            INC  DE
            LD   A,D
            OR   E
            JR   NZ,NAVCOLNE
            JR   NAVCOLCA
; EditorNavigationColumnTab
NAVCOLTA:
            EX   DE,HL
            CALL NAVNEXTA
            EX   DE,HL
            JR   NC,NAVCOLNE
; EditorNavigationColumnCarry
NAVCOLCA:
            LD   A,(COLHIG)
            INC  A
            LD   (COLHIG),A
; EditorNavigationColumnNext
NAVCOLNE:
            INC  HL
            JR   NAVCOLLO
; EditorNavigationColumnDone
NAVCOLDO:
            EX   DE,HL
            LD   A,(COLHIG)
            OR   A
            RET

; Advance the low word to the next tab stop; carry reports a 16-bit wrap.
;@ROUTINE in HL out HL,carry,zero clobbers sign,parity,halfCarry,A
; EditorNavigationNextTab
NAVNEXTA:
            LD   A,L
            OR   7
            INC  A
            LD   L,A
            RET  NZ
            INC  H
            RET  NZ
            SCF
            RET

; Return the insertion offset on the line beginning at HL whose visual column
; is nearest to, but does not exceed, A:DE.
;@ROUTINE in A,DE,HL out HL,carry,zero clobbers sign,parity,halfCarry,A,BC,DE
; EditorNavigationOffsetForColumn
NAVOFFFO:
            LD   (TARCOLHI),A
            XOR  A
            LD   (COLHIG),A
            LD   (SCRATCHA),DE
            LD   BC,0
; EditorNavigationOffsetLoop
NAVOFFLO:
            LD   (SCRATCHC),HL
            PUSH HL
            CALL BUFBYTAT
            POP  HL
            RET  C
            CP   10
            RET  Z
            CP   13
            RET  Z
            CP   9
            JR   Z,NAVOFFTA
            INC  BC
            LD   A,B
            OR   C
            JR   NZ,NAVOFFCO
            JR   NAVOFFCA
; EditorNavigationOffsetTab
NAVOFFTA:
            LD   H,B
            LD   L,C
            CALL NAVNEXTA
            LD   B,H
            LD   C,L
            JR   NC,NAVOFFCO
; EditorNavigationOffsetCarry
NAVOFFCA:
            LD   A,(COLHIG)
            INC  A
            LD   (COLHIG),A
; EditorNavigationOffsetCompare
NAVOFFCO:
            LD   A,(TARCOLHI)
            LD   D,A
            LD   A,(COLHIG)
            CP   D
            JR   C,NAVOFFT1
            JR   NZ,NAVOFFRE
            LD   H,B
            LD   L,C
            LD   DE,(SCRATCHA)
            OR   A
            SBC  HL,DE
            JR   C,NAVOFFT1
            JR   Z,NAVOFFT1
; EditorNavigationOffsetReject
NAVOFFRE:
            LD   HL,(SCRATCHC)
            RET
; EditorNavigationOffsetTake
NAVOFFT1:
            LD   HL,(SCRATCHC)
            INC  HL
            JR   NAVOFFLO
; EditorNavigationCodeEnd
NAVCODEN:
