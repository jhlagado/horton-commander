; Compatibility command wrappers over the logical document interface.
; Cursor, dirty and status remain command/session policy, not document state.
; EditorBufferCodeStart
BUFCODST:
;@ROUTINE in A out A,carry,zero clobbers sign,parity,halfCarry,BC,DE,HL
; EditorBufferInsertByte
BUFINSBY:
            LD   (SCRATCHC),A
            LD   HL,1
            JR   BUFINS

;@ROUTINE out A,carry,zero clobbers sign,parity,halfCarry,BC,DE,HL
; EditorBufferInsertNewline
BUFINSNE:
            LD   HL,$0A0D
            LD   (SCRATCHC),HL
            LD   HL,2
; EditorBufferInsert
BUFINS:
            LD   (DOCINS),HL
            LD   HL,SCRATCHC
            LD   (DOCINP),HL
            LD   HL,0
            LD   (DOCREM),HL
            LD   HL,(CURSOR)
            LD   (DOCSTA),HL
            CALL DOCSPL
            JR   C,BUFDOCFA
            LD   HL,(CURSOR)
            LD   DE,(DOCINS)
            ADD  HL,DE
            LD   (CURSOR),HL
            JP   BUFCHA

;@ROUTINE out A,carry,zero clobbers sign,parity,halfCarry,BC,DE,HL
; EditorBufferBackspace
BUFBAC:
            LD   HL,(CURSOR)
            LD   A,H
            OR   L
            JP   Z,BUFBOU
            DEC  HL
            PUSH HL
            CALL DOCREABY
            POP  HL
            CP   10
            JR   NZ,BUFBACON
            LD   A,H
            OR   L
            JR   Z,BUFBACON
            DEC  HL
            PUSH HL
            CALL DOCREABY
            POP  HL
            CP   13
            JR   Z,BUFBACTW
            INC  HL
; EditorBufferBackspaceOne
BUFBACON:
            LD   A,1
            JR   BUFBACAP
; EditorBufferBackspaceTwo
BUFBACTW:
            LD   A,2
; EditorBufferBackspaceApply
BUFBACAP:
            LD   (DOCSTA),HL
            CALL BUFDELAT
            RET  C
            LD   HL,(DOCSTA)
            LD   (CURSOR),HL
            OR   A
            RET

;@ROUTINE out A,carry,zero clobbers sign,parity,halfCarry,BC,DE,HL
; EditorBufferDelete
BUFDEL:
            LD   HL,(CURSOR)
            CALL DOCREABY
            JP   C,BUFBOU
            CP   13
            LD   A,1
            JR   NZ,BUFDELSP
            LD   A,2

; Legacy byte-count deletion command; mutation itself is document-private.
;@ROUTINE in A out A,carry,zero clobbers sign,parity,halfCarry,BC,DE,HL
; EditorBufferDeleteSpan
BUFDELSP:
            LD   HL,(CURSOR)
            LD   (DOCSTA),HL
; EditorBufferDeleteAt
BUFDELAT:
            LD   L,A
            LD   H,0
            LD   (DOCREM),HL
            LD   HL,0
            LD   (DOCINS),HL
            LD   (DOCINP),HL
            CALL DOCSPL
            JR   NC,BUFCHA
; EditorBufferDocumentFailure
BUFDOCFA:
            CP   DOCERRCA
            JP   NZ,BUFBOU
; EditorBufferFull
BUFFUL:
            LD   A,STAFUL
            LD   (STATUS),A
            SCF
            RET

;@ROUTINE out A,carry,zero clobbers sign,parity,halfCarry,HL
; EditorBufferChanged
BUFCHA:
            LD   HL,FLAGS
            SET  0,(HL)
            XOR  A
            LD   (STATUS),A
            RET

;@ROUTINE out A,carry,zero clobbers sign,parity,halfCarry
; EditorBufferBoundary
BUFBOU:
            LD   A,STABOU
            LD   (STATUS),A
            SCF
            RET

;@ROUTINE in HL out A,HL,carry,zero clobbers sign,parity,halfCarry,DE
; EditorBufferByteAt
BUFBYTAT:
            JP   DOCREABY
; EditorBufferCodeEnd
BUFCODEN:
