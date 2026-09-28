; Lazy-gap document implementation. Logical offsets, not physical addresses,
; cross the mutation boundary. Non-reentrant; no console, file or session state.
; Span pointers remain valid only until reset, append or splice. Request/input
; storage must be stable and outside document-owned scratch during the call.
; EditorDocumentCodeStart
DOCCODST:

;@ROUTINE out A,HL,carry,zero clobbers sign,parity,halfCarry
; EditorDocumentReset
DOCRES:
            LD   HL,0
            LD   (LENGTH),HL
            LD   (DOCGAPST),HL
            LD   HL,TEXCAP
            LD   (DOCGAPEN),HL
            LD   A,2
            LD   (DOCPENCH),A
            XOR  A
            LD   (DOCCHAFL),A
            RET

; Privileged load builder: use only after Reset and before interactive edits.
; Caller validates encoding; the end gap remains after the loaded prefix.
; BC and input A survive.
; A full append changes neither length nor arena. No command change is emitted.
;@ROUTINE in A out A,carry,zero clobbers sign,parity,halfCarry,DE,HL
; EditorDocumentAppend
DOCAPP:
            LD   DE,(LENGTH)
            LD   HL,TEXCAP
            OR   A
            SBC  HL,DE
            JR   Z,DOCAPPFU
            LD   HL,TEXTBASE
            ADD  HL,DE
            LD   (HL),A
            INC  DE
            LD   (LENGTH),DE
            LD   (DOCGAPST),DE
            PUSH AF
            LD   A,2
            LD   (DOCPENCH),A
            POP  AF
            OR   A
            RET
; EditorDocumentAppendFull
DOCAPPFU:
            SCF
            RET

; At EOF/range failure carry is set. Successful HL is the physical address;
; BC survives, matching the original byte getter's calling convention.
;@ROUTINE in HL out A,HL,carry,zero clobbers sign,parity,halfCarry,DE
; EditorDocumentReadByte
DOCREABY:
            LD   DE,(LENGTH)
            OR   A
            SBC  HL,DE
            JR   NC,DOCREAB1
            ADD  HL,DE
            CALL DOCPHYAD
            LD   A,(HL)
            OR   A
            RET
; EditorDocumentReadByteEnd
DOCREAB1:
            SCF
            RET

; Map an already-validated logical byte offset, without reading that byte.
; BC survives. No relocation or writable state is involved.
;@ROUTINE in HL out A,HL,carry,zero clobbers sign,parity,halfCarry,DE
; EditorDocumentPhysicalAddress
DOCPHYAD:
            LD   DE,(DOCGAPST)
            OR   A
            SBC  HL,DE
            JR   NC,DOCPHYSU
            ADD  HL,DE
            JR   DOCPHYBA
; EditorDocumentPhysicalSuffix
DOCPHYSU:
            LD   DE,(DOCGAPEN)
            ADD  HL,DE
; EditorDocumentPhysicalBase
DOCPHYBA:
            LD   DE,TEXTBASE
            ADD  HL,DE
            XOR  A
            RET

; Forward span at logical HL: physical HL and nonzero BC on success.
; EOF/range returns BC=0, carry set. Stops at the gap or EOF, without relocation.
; With a zero-sized gap the two adjacent physical spans may remain separate.
;@ROUTINE in HL out A,HL,BC,carry,zero clobbers sign,parity,halfCarry,DE
; EditorDocumentReadSpan
DOCREASP:
            LD   DE,(LENGTH)
            PUSH HL
            OR   A
            SBC  HL,DE
            POP  HL
            JR   NC,DOCREAS3
            LD   DE,(DOCGAPST)
            PUSH HL
            OR   A
            SBC  HL,DE
            POP  HL
            JR   C,DOCREAS2
            LD   DE,(LENGTH)
; EditorDocumentReadSpanCount
DOCREAS2:
            PUSH HL
            EX   DE,HL
            OR   A
            SBC  HL,DE
            LD   B,H
            LD   C,L
            POP  HL
            JP   DOCPHYAD
; EditorDocumentReadSpanEnd
DOCREAS3:
            LD   BC,0
            SCF
            RET

; Backward span before exclusive logical HL. Successful HL is the final byte;
; BC counts backward to the gap or start. Zero/out-of-range returns BC=0/carry.
;@ROUTINE in HL out A,HL,BC,carry,zero clobbers sign,parity,halfCarry,DE
; EditorDocumentReadSpanBackward
DOCREAS1:
            LD   A,H
            OR   L
            JR   Z,DOCREAS3
            LD   DE,(LENGTH)
            PUSH HL
            OR   A
            SBC  HL,DE
            POP  HL
            JR   C,DOCBACVA
            JR   NZ,DOCREAS3
; EditorDocumentBackwardValid
DOCBACVA:
            PUSH HL
            LD   DE,(DOCGAPST)
            OR   A
            SBC  HL,DE
            JR   C,DOCBACPR
            JR   Z,DOCBACPR
            LD   B,H
            LD   C,L
            POP  HL
            JR   DOCBACAD
; EditorDocumentBackwardPrefix
DOCBACPR:
            POP  HL
            LD   B,H
            LD   C,L
; EditorDocumentBackwardAddress
DOCBACAD:
            DEC  HL
            JP   DOCPHYAD

; Checked logical copy to external DE, BC bytes. Zero length at EOF is valid.
; Destination must not overlap the arena or document scratch. All bounds are
; checked before the first destination write. Spans are consumed in bulk.
;@ROUTINE in HL,DE,BC out A,carry,zero clobbers sign,parity,halfCarry,BC,DE,HL
; EditorDocumentReadRange
DOCREARA:
            LD   (DOCRANOF),HL
            LD   (DOCRANTA),DE
            LD   (DOCRANCO),BC
            ADD  HL,BC
            JP   C,DOCRANER
            LD   DE,(LENGTH)
            OR   A
            SBC  HL,DE
            JP   C,DOCRANVA
            JP   NZ,DOCRANER
; EditorDocumentRangeValid
DOCRANVA:
            LD   A,B
            OR   C
            RET  Z
            LD   HL,(DOCRANTA)
            CALL DOCCHEEX
            RET  C
; EditorDocumentReadRangeLoop
DOCREAR1:
            LD   HL,(DOCRANOF)
            CALL DOCREASP
            ; The validated range guarantees a nonempty span.
            LD   DE,(DOCRANCO)
            PUSH HL
            LD   H,B
            LD   L,C
            OR   A
            SBC  HL,DE
            JR   C,DOCREAR2
            LD   B,D
            LD   C,E
; EditorDocumentReadRangeSpan
DOCREAR2:
            POP  HL
            PUSH BC
            LD   DE,(DOCRANTA)
            LDIR
            LD   (DOCRANTA),DE
            POP  BC
            LD   HL,(DOCRANOF)
            ADD  HL,BC
            LD   (DOCRANOF),HL
            LD   HL,(DOCRANCO)
            OR   A
            SBC  HL,BC
            LD   (DOCRANCO),HL
            LD   A,H
            OR   L
            JR   NZ,DOCREAR1
            RET

; HL pointer, BC nonzero count. Reject wrapped spans and overlap with the
; arena or any document request/result/scratch byte before reading/writing.
;@ROUTINE in HL,BC out A,carry,zero clobbers sign,parity,halfCarry,DE,HL
; EditorDocumentCheckExternal
DOCCHEEX:
            ; Length remains in its legacy slot but is document-owned state.
            PUSH HL
            ADD  HL,BC
            JR   C,DOCEXTWR
            LD   DE,LENGTH
            OR   A
            SBC  HL,DE
            POP  HL
            JR   C,DOCEXTAR
            JR   Z,DOCEXTAR
            PUSH HL
            LD   DE,LENGTH+2
            OR   A
            SBC  HL,DE
            POP  HL
            JP   C,DOCALIER
; EditorDocumentExternalArena
DOCEXTAR:
            PUSH HL
            ADD  HL,BC
            JR   C,DOCEXTWR
            LD   DE,TEXTBASE
            OR   A
            SBC  HL,DE
            POP  HL
            JR   C,DOCEXTWO
            JR   Z,DOCEXTWO
            PUSH HL
            LD   DE,TEXLIM
            OR   A
            SBC  HL,DE
            POP  HL
            JP   C,DOCALIER
; EditorDocumentExternalWorkspace
DOCEXTWO:
            PUSH HL
            ADD  HL,BC
            LD   DE,DOCSTA
            OR   A
            SBC  HL,DE
            POP  HL
            JR   C,DOCEXTRE
            JR   Z,DOCEXTRE
            LD   DE,DOCWOREN
            OR   A
            SBC  HL,DE
            JP   C,DOCALIER
; EditorDocumentExternalReady
DOCEXTRE:
            XOR  A
            RET
; EditorDocumentExternalWrap
DOCEXTWR:
            POP  HL
            JP   DOCRANER

; Exact literal match across spans. C nonzero (1..64), DE stable query bytes
; excluding newlines. Z=match, NZ=no match including EOF. C is preserved.
; Reads never change DocChange fields or session scratch.
;@ROUTINE in HL,DE,C out A,carry,zero clobbers sign,parity,halfCarry,B,DE,HL
; EditorDocumentMatchLiteral
DOCMATLI:
            PUSH BC
            LD   (DOCMATOF),HL
            LD   (DOCMATIN),DE
            LD   A,C
            LD   (DOCMATCO),A
; EditorDocumentMatchSpan
DOCMATSP:
            LD   HL,(DOCMATOF)
            CALL DOCREASP
            JR   C,DOCMATNO
            LD   DE,(DOCMATIN)
; EditorDocumentMatchLoop
DOCMATLO:
            LD   A,(DE)
            CP   (HL)
            JR   NZ,DOCMATNO
            INC  HL
            INC  DE
            LD   A,(DOCMATCO)
            DEC  A
            LD   (DOCMATCO),A
            JR   Z,DOCMATYE
            PUSH HL
            LD   HL,(DOCMATOF)
            INC  HL
            LD   (DOCMATOF),HL
            POP  HL
            DEC  BC
            LD   A,B
            OR   C
            JR   NZ,DOCMATLO
            LD   (DOCMATIN),DE
            JR   DOCMATSP
; EditorDocumentMatchYes
DOCMATYE:
            XOR  A
            POP  BC
            RET
; EditorDocumentMatchNo
DOCMATNO:
            LD   A,1
            OR   A
            POP  BC
            RET

; Atomic validated splice using four request words. Success A=0/carry clear;
; failure A=error/carry set. Result flags zero for rejection or an empty splice.
; Result range words are meaningful only when content flag bit 0 is set.
;@ROUTINE out A,carry,zero clobbers sign,parity,halfCarry,BC,DE,HL
; EditorDocumentSplice
DOCSPL:
            XOR  A
            LD   (DOCCHAFL),A
            LD   HL,(DOCSTA)
            LD   DE,(LENGTH)
            OR   A
            SBC  HL,DE
            JP   C,DOCSTAVA
            JP   NZ,DOCRANER
; EditorDocumentStartValid
DOCSTAVA:
            LD   HL,(DOCSTA)
            LD   DE,(DOCREM)
            ADD  HL,DE
            JP   C,DOCRANER
            LD   (DOCEND),HL
            LD   DE,(LENGTH)
            OR   A
            SBC  HL,DE
            JP   C,DOCENDVA
            JP   NZ,DOCRANER
; EditorDocumentEndValid
DOCENDVA:
            LD   HL,(DOCSTA)
            CALL DOCCHEEN
            RET  C
            LD   HL,(DOCEND)
            CALL DOCCHEEN
            RET  C
            LD   HL,(LENGTH)
            LD   DE,(DOCREM)
            OR   A
            SBC  HL,DE
            LD   DE,(DOCINS)
            ADD  HL,DE
            JP   C,DOCCAPER
            LD   (DOCNEWLE),HL
            LD   DE,TEXCAP
            OR   A
            SBC  HL,DE
            JP   C,DOCCAPVA
            JP   NZ,DOCCAPER
; EditorDocumentCapacityValid
DOCCAPVA:
            LD   A,1
            LD   (DOCWORFL),A
            LD   BC,(DOCINS)
            LD   A,B
            OR   C
            JR   Z,DOCINPVA
            LD   HL,(DOCINP)
            CALL DOCCHEEX
            RET  C
            LD   HL,(DOCINP)
            LD   D,0
; EditorDocumentValidateInput
DOCVALIN:
            LD   A,(HL)
            LD   E,A
            LD   A,D
            OR   A
            LD   A,E
            JR   Z,DOCVALOR
            CP   10
            JP   NZ,DOCTEXER
            LD   D,0
            JR   DOCVALNE
; EditorDocumentValidateOrdinary
DOCVALOR:
            CP   13
            JR   NZ,DOCVALNO
            LD   D,1
            JR   DOCVALNE
; EditorDocumentValidateNotCr
DOCVALNO:
            CP   10
            JR   Z,DOCVALNE
            CP   9
            JR   Z,DOCVALN1
            CP   32
            JP   C,DOCTEXER
            CP   127
            JP   NC,DOCTEXER
            JR   DOCVALN1
; EditorDocumentValidateNewline
DOCVALNE:
            LD   A,3
            LD   (DOCWORFL),A
; EditorDocumentValidateNext
DOCVALN1:
            INC  HL
            DEC  BC
            LD   A,B
            OR   C
            JR   NZ,DOCVALIN
            LD   A,D
            OR   A
            JP   NZ,DOCTEXER
; EditorDocumentInputValid
DOCINPVA:
            LD   BC,(DOCREM)
            LD   HL,(DOCINS)
            LD   A,H
            OR   L
            OR   B
            OR   C
            RET  Z
            LD   A,B
            OR   C
            JR   Z,DOCREMSC
            LD   (DOCRANCO),BC
            LD   HL,(DOCSTA)
            LD   (DOCRANOF),HL
; EditorDocumentRemovedSpan
DOCREMSP:
            LD   HL,(DOCRANOF)
            CALL DOCREASP
            ; Clamp the physical span to the still-unscanned removed range.
            PUSH HL
            LD   HL,(DOCRANCO)
            OR   A
            SBC  HL,BC
            JR   NC,DOCREMS1
            LD   BC,(DOCRANCO)
; EditorDocumentRemovedSpanCount
DOCREMS1:
            LD   HL,(DOCRANOF)
            ADD  HL,BC
            LD   (DOCRANOF),HL
            LD   HL,(DOCRANCO)
            OR   A
            SBC  HL,BC
            LD   (DOCRANCO),HL
            POP  HL
; EditorDocumentScanRemoved
DOCSCARE:
            LD   A,(HL)
            CP   10
            JR   NZ,DOCSCAR1
            LD   A,3
            LD   (DOCWORFL),A
            JR   DOCREMSC
; EditorDocumentScanRemovedNext
DOCSCAR1:
            INC  HL
            DEC  BC
            LD   A,B
            OR   C
            JR   NZ,DOCSCARE
            LD   HL,(DOCRANCO)
            LD   A,H
            OR   L
            JR   NZ,DOCREMSP
; EditorDocumentRemovedScanned
DOCREMSC:
            ; All rejection checks are complete. Only accepted edits relocate.
            CALL DOCMOVGA
            ; Removed bytes become additional gap space before inserting, so
            ; equal-sized replacement is valid even in a previously full arena.
            LD   HL,(DOCGAPEN)
            LD   DE,(DOCREM)
            ADD  HL,DE
            LD   (DOCGAPEN),HL
            LD   BC,(DOCINS)
            LD   A,B
            OR   C
            JR   Z,DOCPUB
            LD   HL,(DOCGAPST)
            LD   DE,TEXTBASE
            ADD  HL,DE
            EX   DE,HL
            LD   HL,(DOCINP)
            LDIR
            LD   HL,(DOCGAPST)
            LD   DE,(DOCINS)
            ADD  HL,DE
            LD   (DOCGAPST),HL
; EditorDocumentPublish
DOCPUB:
            LD   HL,(DOCNEWLE)
            LD   (LENGTH),HL
            LD   HL,(DOCSTA)
            LD   (DOCCHAST),HL
            LD   HL,(DOCREM)
            LD   (DOCCHARE),HL
            LD   HL,(DOCINS)
            LD   (DOCCHAIN),HL
            LD   A,(DOCWORFL)
            LD   (DOCCHAFL),A
            LD   A,(DOCPENCH)
            CP   2
            JR   NC,DOCCHACO
            INC  A
            LD   (DOCPENCH),A
; EditorDocumentChangeCountReady
DOCCHACO:
            XOR  A
            RET

; Generic synchronous change acknowledgement. Count saturates at two so a
; consumer cannot confuse an unobserved batch with a single range update.
;@ROUTINE out A,carry,zero clobbers sign,parity,halfCarry
; EditorDocumentAcknowledgeChanges
DOCACKCH:
            XOR  A
            LD   (DOCPENCH),A
            RET

; Move the gap to the prevalidated request start. A zero-sized gap needs
; only new bounds, and a gap already at the edit point copies no document bytes.
; The direction-specific block transfer protects overlap. No zero-count LDIR.
;@ROUTINE out A,carry,zero clobbers sign,parity,halfCarry,BC,DE,HL
; EditorDocumentMoveGap
DOCMOVGA:
            LD   HL,(DOCGAPEN)
            LD   DE,(DOCGAPST)
            OR   A
            SBC  HL,DE
            JR   Z,DOCMOVEM
            LD   HL,(DOCSTA)
            OR   A
            SBC  HL,DE
            RET  Z
            JR   C,DOCMOVLE
            LD   (DOCTAI),HL
            LD   B,H
            LD   C,L
            LD   HL,(DOCGAPST)
            LD   DE,TEXTBASE
            ADD  HL,DE
            PUSH HL
            LD   HL,(DOCGAPEN)
            ADD  HL,DE
            POP  DE
            LDIR
            LD   HL,(DOCGAPEN)
            LD   DE,(DOCTAI)
            ADD  HL,DE
            JR   DOCMOVPU
; EditorDocumentMoveLeft
DOCMOVLE:
            LD   HL,(DOCGAPST)
            LD   DE,(DOCSTA)
            OR   A
            SBC  HL,DE
            LD   (DOCTAI),HL
            LD   B,H
            LD   C,L
            LD   HL,(DOCGAPEN)
            LD   DE,TEXTBASE-1
            ADD  HL,DE
            PUSH HL
            LD   HL,(DOCGAPST)
            ADD  HL,DE
            POP  DE
            LDDR
            LD   HL,(DOCGAPEN)
            LD   DE,(DOCTAI)
            OR   A
            SBC  HL,DE
; EditorDocumentMovePublish
DOCMOVPU:
            LD   (DOCGAPEN),HL
            LD   HL,(DOCSTA)
            LD   (DOCGAPST),HL
            OR   A
            RET
; EditorDocumentMoveEmptyGap
DOCMOVEM:
            LD   HL,(DOCSTA)
            LD   (DOCGAPST),HL
            LD   (DOCGAPEN),HL
            OR   A
            RET

; A legal cursor/range endpoint cannot follow the CR half of a CRLF pair.
;@ROUTINE in HL out A,carry,zero clobbers sign,parity,halfCarry,DE,HL
; EditorDocumentCheckEndpoint
DOCCHEEN:
            LD   A,H
            OR   L
            RET  Z
            DEC  HL
            CALL DOCREABY
            CP   13
            JP   Z,DOCTEXER
            OR   A
            RET
; EditorDocumentRangeError
DOCRANER:
            LD   A,DOCERRRA
            SCF
            RET
; EditorDocumentTextError
DOCTEXER:
            LD   A,DOCERRTE
            SCF
            RET
; EditorDocumentCapacityError
DOCCAPER:
            LD   A,DOCERRCA
            SCF
            RET
; EditorDocumentAliasError
DOCALIER:
            LD   A,DOCERRAL
            SCF
            RET
; EditorDocumentCodeEnd
DOCCODEN:
