; Full repaint for the 80-by-24 terminal profile.

; EditorScreenCodeStart
SCRCODST:
;@ROUTINE out A,carry,zero clobbers sign,parity,halfCarry,BC,DE,HL
; EditorRender
RENDER:
            CALL LAYRES
            XOR  A
            LD   (DISSTAVA),A
            JP   PRESENT

; Incremental presentation after one raw command. Layout reports byte-independent
; damage and owns cache invalidation; this adapter emits only affected rows.
;@ROUTINE out A,carry,zero clobbers sign,parity,halfCarry,BC,DE,HL
; EditorPresent
PRESENT:
            CALL LAYPRE
            OR   A
            JP   Z,DISSTA
            CP   3
            JR   NZ,DISPAR
            LD   DE,CLEHOM
            CALL OUTTEX
            XOR  A
            LD   (DISSTAVA),A
            LD   B,0
            LD   A,3
; EditorDisplayPartial
DISPAR:
            LD   C,A
            LD   A,B
            LD   (DISROW),A
            INC  A
            LD   D,A
            LD   A,C
            CP   1
            LD   A,23
            JR   NZ,DISENDRE
            LD   A,D
; EditorDisplayEndReady
DISENDRE:
            LD   (DISENDRO),A
; EditorDisplayRowLoop
DISROWLO:
            LD   DE,CURPRE
            CALL OUTTEX
            LD   A,(DISROW)
            INC  A
            CALL OUTDEC
            LD   A,';'
            CALL OUTBYT
            LD   A,'1'
            CALL OUTBYT
            LD   A,'H'
            CALL OUTBYT
            LD   A,(DISROW)
            CALL LAYGETRO
            JR   C,DISBLARO
            LD   (RENPOI),HL
            LD   (RENCOL),DE
            LD   (RENCOLHI),A
            LD   HL,0
            LD   (RENCOU),HL
            CALL DISPAILI
            LD   A,(RENCOU)
            CP   80
            JR   Z,DISNEXRO
; EditorDisplayBlankRow
DISBLARO:
            LD   DE,ERALIN
            CALL OUTTEX
; EditorDisplayNextRow
DISNEXRO:
            LD   HL,DISROW
            INC  (HL)
            LD   A,(DISENDRO)
            CP   (HL)
            JR   NZ,DISROWLO
; EditorDisplayStatus
DISSTA:
            LD   A,(DISSTAVA)
            OR   A
            JR   Z,DISREFST
            LD   A,(FLAGS)
            AND  FLADIR
            LD   B,A
            LD   A,(DISLASFL)
            CP   B
            JR   NZ,DISREFST
            LD   A,(EDSTATUS)
            LD   B,A
            LD   A,(DISLASST)
            CP   B
            JR   NZ,DISREFST
            LD   DE,CURPRE
            CALL OUTTEX
            JP   POSCUR
; EditorDisplayRefreshStatus
DISREFST:
            LD   A,(FLAGS)
            AND  FLADIR
            LD   (DISLASFL),A
            LD   A,(EDSTATUS)
            LD   (DISLASST),A
            LD   A,1
            LD   (DISSTAVA),A
            JP   RENSTA

; Each row starts from a cached near-left anchor and stops at its known content
; end or eighty visible cells. Hidden suffixes and whole prefixes are not read.
; EditorDisplayPaintLine
DISPAILI:
            LD   A,(RENCOU)
            CP   80
            RET  Z
            LD   HL,(RENPOI)
            LD   DE,(LAYROWEN)
            OR   A
            SBC  HL,DE
            RET  NC
            LD   HL,(RENPOI)
            CALL DOCREABY
            RET  C
            CP   9
            JR   Z,DISTAB
            CALL RENCEL
            JR   DISADV
; EditorDisplayTab
DISTAB:
            LD   HL,(RENCOL)
            CALL NAVNEXTA
            LD   (SCRATCHB),HL
; EditorDisplayTabLoop
DISTABLO:
            LD   A,' '
            CALL RENCEL
            LD   A,(RENCOU)
            CP   80
            RET  Z
            LD   HL,(RENCOL)
            LD   DE,(SCRATCHB)
            OR   A
            SBC  HL,DE
            JR   NZ,DISTABLO
; EditorDisplayAdvance
DISADV:
            LD   HL,(RENPOI)
            INC  HL
            LD   (RENPOI),HL
            JR   DISPAILI

;@ROUTINE out A,carry,zero clobbers sign,parity,halfCarry,BC,DE,HL
; EditorEnsureViewport
ENSVIE:
            ; A valid viewport already records the cursor's row. Avoid walking
            ; the same row boundaries again through repeated cache lookups.
            LD   HL,(TOP)
            LD   DE,(LAYORITO)
            OR   A
            SBC  HL,DE
            JR   NZ,ENSDIS
            LD   HL,(CURSOR)
            CALL LAYFINLI
            JR   C,ENSDIS
            LD   B,A
            JR   ENSROWRE
; EditorEnsureDiscover
ENSDIS:
            ; Once outside the cached viewport, repeated lookups cannot help
            ; the cold walk. Rebuild after discovery instead of probing each row.
            CALL LAYRES
            LD   HL,(CURSOR)
            CALL NAVLINST
            LD   (SCRATCHA),HL
; EditorEnsureVertical
ENSVER:
            LD   DE,(TOP)
            OR   A
            SBC  HL,DE
            JR   NC,ENSCOURO
            LD   HL,(SCRATCHA)
            LD   (TOP),HL
; EditorEnsureCountRows
ENSCOURO:
            LD   HL,(TOP)
            LD   B,0
; EditorEnsureRowLoop
ENSROWLO:
            LD   DE,(SCRATCHA)
            PUSH HL
            OR   A
            SBC  HL,DE
            POP  HL
            JR   Z,ENSROWRE
            CALL NAVNEXLI
            JR   C,ENSROWRE
            INC  B
            LD   A,B
            CP   23
            JR   C,ENSROWLO
            LD   HL,(TOP)
            CALL NAVNEXLI
            JR   C,ENSROWRE
            LD   (TOP),HL
            LD   HL,(SCRATCHA)
            JR   ENSVER
; EditorEnsureRowReady
ENSROWRE:
            LD   A,B
            LD   (CURSCRRO),A
            CALL NAVCURCO
            OR   A
            JR   NZ,ENSHOR
            LD   DE,80
            PUSH HL
            OR   A
            SBC  HL,DE
            POP  HL
            JR   C,ENSNOHOR
; EditorEnsureHorizontal
ENSHOR:
            LD   DE,79
            OR   A
            SBC  HL,DE
            LD   (HOR),HL
            SBC  A,0
            LD   (HORHIG),A
            LD   HL,79
            JR   ENSCOLRE
; EditorEnsureNoHorizontal
ENSNOHOR:
            XOR  A
            LD   (HORHIG),A
            LD   DE,0
            LD   (HOR),DE
; EditorEnsureColumnReady
ENSCOLRE:
            LD   A,L
            LD   (CURSCRCO),A
            RET

; Render one visual cell in A when it lies in the horizontal viewport.
;@ROUTINE in A out A,carry,zero clobbers sign,parity,halfCarry,BC,DE,HL
; EditorRenderCell
RENCEL:
            LD   (SCRATCHC),A
            LD   A,(HORHIG)
            LD   D,A
            LD   A,(RENCOLHI)
            CP   D
            JR   C,RENCELAD
            JR   NZ,RENCELVI
            LD   HL,(RENCOL)
            LD   DE,(HOR)
            PUSH HL
            OR   A
            SBC  HL,DE
            POP  HL
            JR   C,RENCELAD
; EditorRenderCellVisible
RENCELVI:
            LD   DE,(RENCOU)
            LD   A,E
            CP   80
            JR   NC,RENCELAD
            LD   A,(SCRATCHC)
            CALL OUTBYT
            LD   HL,(RENCOU)
            INC  HL
            LD   (RENCOU),HL
; EditorRenderCellAdvance
RENCELAD:
            LD   HL,(RENCOL)
            INC  HL
            LD   (RENCOL),HL
            LD   A,H
            OR   L
            RET  NZ
            LD   A,(RENCOLHI)
            INC  A
            LD   (RENCOLHI),A
            RET

;@ROUTINE out A,carry,zero clobbers sign,parity,halfCarry,BC,DE,HL
; EditorRenderStatus
RENSTA:
            LD   DE,STAPRE
            CALL STABEG
            LD   A,(FCB)
            OR   A
            JR   Z,STADRIVE
            DEC  A
            ADD  A,'A'
            CALL STABYT
            LD   A,':'
            CALL STABYT
; EditorStatusNameStart
STADRIVE:
            LD   HL,FCB+1
            LD   B,8
; EditorStatusNameLoop
STANAMLO:
            LD   A,(HL)
            PUSH HL
            PUSH BC
            CALL STABYT
            POP  BC
            POP  HL
            INC  HL
            DJNZ STANAMLO
            LD   A,'.'
            CALL STABYT
            LD   HL,FCB+9
            LD   B,3
; EditorStatusExtensionLoop
STAEXTLO:
            LD   A,(HL)
            PUSH HL
            PUSH BC
            CALL STABYT
            POP  BC
            POP  HL
            INC  HL
            DJNZ STAEXTLO
            LD   A,' '
            CALL STABYT
            LD   A,(FLAGS)
            AND  FLADIR
            LD   A,' '
            JR   Z,STADIRRE
            LD   A,'*'
; EditorStatusDirtyReady
STADIRRE:
            CALL STABYT
            LD   A,' '
            CALL STABYT
            LD   A,' '
            CALL STABYT
            CALL STAMES
            LD   DE,STAHIN
            LD   A,(EDSTATUS)
            OR   A
            JR   Z,RENSTAHI
            CP   STADIS
            JR   NZ,RENSTAMH
            LD   DE,STADHINT
            JR   RENSTAHI
; EditorStatusMessageHelp
RENSTAMH:
            LD   DE,STAMHINT
; EditorStatusHelpReady
RENSTAHI:
            CALL STATEX
;@ROUTINE out A,carry,zero clobbers sign,parity,halfCarry,BC,DE,HL
; EditorStatusFill
STAFIL:
            LD   HL,(RENCOU)
            LD   A,L
            CP   80
            JR   NC,STAFIL1
            LD   A,' '
            CALL STABYT
            JR   STAFIL
; EditorStatusFilled
STAFIL1:
            LD   DE,REVOFF
            CALL OUTTEX
            JP   POSCUR

;@ROUTINE in DE out A,carry,zero clobbers sign,parity,halfCarry,BC,DE,HL
; EditorStatusBegin
STABEG:
            PUSH DE
            LD   DE,STAPOS
            CALL OUTTEX
            LD   HL,0
            LD   (RENCOU),HL
            POP  DE
            JP   STATEX

;@ROUTINE out A,carry,zero clobbers sign,parity,halfCarry,BC,DE,HL
; EditorStatusMessage
STAMES:
            LD   A,(EDSTATUS)
            OR   A
            RET  Z
            ADD  A,A
            CP   STASAV*2
            LD   DE,STASAVTE
            JR   Z,STAMESTE
            CP   STAFUL*2
            LD   DE,STAFULTE
            JR   Z,STAMESTE
            CP   STADIS*2
            LD   DE,STADISTE
            JR   Z,STAMESTE
            CP   STASAVCO*2
            JR   C,STAMESDO
            LD   DE,STASAVFA
            CALL STATEX
            LD   A,(EDSTATUS)
            OR   A
            PUSH AF
            RRCA
            RRCA
            RRCA
            RRCA
            CALL STAHEXNI
            POP  AF
            CALL STAHEXNI
; EditorStatusMessageDone
STAMESDO:
            RET
; EditorStatusMessageText
STAMESTE:
            JR   STATEX
;@ROUTINE in DE out A,carry,zero clobbers sign,parity,halfCarry,BC,DE,HL
; EditorStatusText
STATEX:
            LD   A,(DE)
            OR   A
            RET  Z
            INC  DE
            PUSH DE
            CALL STABYT
            POP  DE
            JR   STATEX

;@ROUTINE in A out A,carry,zero clobbers sign,parity,halfCarry,BC,DE,HL
; EditorStatusByte
STABYT:
            CALL OUTBYT
            LD   HL,(RENCOU)
            INC  HL
            LD   (RENCOU),HL
            RET

;@ROUTINE in A out A,carry,zero clobbers sign,parity,halfCarry,BC,DE,HL
; EditorStatusHexNibble
STAHEXNI:
            AND  $0F
            ADD  A,'0'
            CP   '9'+1
            JR   C,STABYT
            ADD  A,7
            JR   STABYT

;@ROUTINE out A,carry,zero clobbers sign,parity,halfCarry,BC,DE,HL
; EditorPositionCursor
POSCUR:
            LD   A,(CURSCRRO)
            INC  A
            LD   (SCRATCHA),A
            LD   A,(CURSCRCO)
            INC  A
            LD   (SCRATCHA+1),A
            LD   A,(SCRATCHA)
            CALL OUTDEC
            LD   A,';'
            CALL OUTBYT
            LD   A,(SCRATCHA+1)
            CALL OUTDEC
            LD   A,'H'
            JR   OUTBYT

;@ROUTINE in A out A,carry,zero clobbers sign,parity,halfCarry,BC,DE,HL
; EditorOutputDecimal
OUTDEC:
            LD   B,0
; EditorOutputDecimalLoop
OUTDECLO:
            CP   10
            JR   C,OUTDECRE
            SUB  10
            INC  B
            JR   OUTDECLO
; EditorOutputDecimalReady
OUTDECRE:
            LD   (SCRATCHC),A
            LD   A,B
            OR   A
            JR   Z,OUTDECON
            ADD  A,'0'
            CALL OUTBYT
; EditorOutputDecimalOnes
OUTDECON:
            LD   A,(SCRATCHC)
            ADD  A,'0'
            JR   OUTBYT

;@ROUTINE in A out A clobbers carry,zero,sign,parity,halfCarry,BC,DE,HL
; EditorOutputByte
OUTBYT:
            LD   E,A
            LD   C,6
            JP   CALLBDOS

;@ROUTINE in DE out A clobbers carry,zero,sign,parity,halfCarry,BC,DE,HL
; EditorOutputText
OUTTEX:
            LD   A,(DE)
            CP   '$'
            RET  Z
            INC  DE
            PUSH DE
            CALL OUTBYT
            POP  DE
            JR   OUTTEX

; EditorScreenCodeEnd
SCRCODEN:
