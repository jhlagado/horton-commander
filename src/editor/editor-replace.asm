; Single literal replacement at an exact current query match. The inactive
; CP/M EDDMA record stages the replacement text.

; EditorReplaceCodeStart
REPCODST:
;@ROUTINE out A,carry,zero clobbers sign,parity,halfCarry,BC,DE,HL,IXH,IXL,IYH,IYL
; EditorReplaceBegin
REPBEG:
            LD   A,(QUELEN)
            OR   A
            JR   Z,SEANOQUE
            LD   C,A
            LD   HL,(CURSOR)
            CALL REPMATAT
            JR   NZ,SEANOTFO
            LD   HL,EDDMA
            LD   (HL),0
            LD   DE,REPPRO
            CALL LITINP
            JP   C,REARET
            LD   A,OPREP
            JP   SESEXE

; Apply the staged replacement at the current exact match as one document splice.
; Growth is checked before any text or persistent editor state changes.
; EditorReplaceApply
REPAPP:
            LD   HL,(CURSOR)
            LD   (DOCSTA),HL
            LD   A,(QUELEN)
            LD   L,A
            LD   H,0
            LD   (DOCREM),HL
            LD   A,(EDDMA)
            LD   L,A
            LD   (DOCINS),HL
            LD   HL,EDDMA+1
            LD   (DOCINP),HL
            CALL DOCSPL
            JP   C,BUFFUL
; EditorReplaceChanged
REPCHA:
            LD   HL,FLAGS
            SET  0,(HL)
            RES  2,(HL)
            INC  HL
            LD   (HL),STAREP
            XOR  A
            RET

; Test the committed query at logical offset HL. C is its nonzero length. Z
; means an exact match. NZ also covers a query extending beyond logical EOF.
;@ROUTINE in C,HL out A,carry,zero clobbers sign,parity,halfCarry,B,DE,HL
; EditorReplaceMatchAt
REPMATAT:
            LD   DE,QUEBUF
            JP   DOCMATLI
; EditorReplaceCodeEnd
REPCODEN:
