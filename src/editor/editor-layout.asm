; One synchronous 23-row layout. Flags bit0=boundaries valid, bit1=cursor column
; valid. Tagged anchors store near-left offsets or exact short-line end columns.
; No terminal/BDOS calls; the presenter owns output and acknowledges screen state.
; EditorLayoutCodeStart
LAYCODST:
;@ROUTINE out A,carry,zero clobbers sign,parity,halfCarry
; EditorLayoutReset
LAYRES:
            XOR  A
            LD   (LAYFLA),A
            LD   (LAYROWCO),A
            RET

; Read boundary[A], A=0..23. BC survives.
;@ROUTINE in A out A,HL clobbers carry,zero,sign,parity,halfCarry,DE
; EditorLayoutBoundary
LAYBOU1:
            ADD  A,A
            LD   E,A
            LD   D,0
            LD   HL,LAYBOU
            ADD  HL,DE
            LD   E,(HL)
            INC  HL
            LD   D,(HL)
            EX   DE,HL
            RET

; Address of the three-byte anchor for row A=0..22. BC survives.
;@ROUTINE in A out A,HL clobbers carry,zero,sign,parity,halfCarry,DE
; EditorLayoutAnchorAddress
LAYANCAD:
            LD   E,A
            ADD  A,A
            ADD  A,E
            LD   E,A
            LD   D,0
            LD   HL,LAYANC
            ADD  HL,DE
            RET

; Cache lookup: HL logical offset -> HL line start, A row, carry clear on hit.
; Miss preserves input HL with carry set. BC survives every path.
;@ROUTINE in HL out A,HL,carry,zero clobbers sign,parity,halfCarry,DE
; EditorLayoutFindLine
LAYFINLI:
            LD   A,(DOCPENCH)
            OR   A
            JR   NZ,LAYFINIM
; EditorLayoutFindOldLine
LAYFINOL:
            PUSH BC
            LD   (LAYSCAPO),HL
            LD   A,(LAYFLA)
            AND  1
            JR   Z,LAYFINMI
            XOR  A
            LD   (LAYIND),A
; EditorLayoutFindLoop
LAYFINLO:
            LD   A,(LAYIND)
            CALL LAYBOU1
            LD   DE,(LAYSCAPO)
            OR   A
            SBC  HL,DE
            JR   C,LAYFINNE
            JR   NZ,LAYFINMI
; EditorLayoutFindNextBound
LAYFINNE:
            LD   A,(LAYIND)
            INC  A
            CALL LAYBOU1
            LD   DE,(LAYSCAPO)
            OR   A
            SBC  HL,DE
            JR   C,LAYFINAD
            JR   NZ,LAYFINHI
            ; Equal next-boundary belongs to the following logical line.
            LD   A,(LAYIND)
            INC  A
            LD   B,A
            LD   A,(LAYROWCO)
            CP   B
            JR   NZ,LAYFINAD
            LD   A,(LAYIND)
            CALL LAYBOU1
            LD   DE,(LAYSCAPO)
            OR   A
            SBC  HL,DE
            JR   Z,LAYFINHI
            LD   HL,(LAYSCAPO)
            DEC  HL
            CALL DOCREABY
            CP   10
            JR   Z,LAYFINMI
            JR   LAYFINHI
; EditorLayoutFindAdvance
LAYFINAD:
            LD   A,(LAYIND)
            INC  A
            LD   (LAYIND),A
            LD   B,A
            LD   A,(LAYROWCO)
            CP   B
            JR   NZ,LAYFINLO
; EditorLayoutFindMiss
LAYFINMI:
            LD   HL,(LAYSCAPO)
            POP  BC
; EditorLayoutFindImmediateMiss
LAYFINIM:
            SCF
            RET
; EditorLayoutFindHit
LAYFINHI:
            LD   A,(LAYIND)
            CALL LAYBOU1
            LD   A,(LAYIND)
            POP  BC
            OR   A
            RET

; Cached next-line lookup. Z means cache hit, carry then indicates logical EOF.
; NZ means miss and the caller must use its raw scan; BC survives.
;@ROUTINE in HL out A,HL,carry,zero clobbers sign,parity,halfCarry,DE
; EditorLayoutNextLine
LAYNEXLI:
            ; EOF is already the final empty line when the document ends in LF.
            ; Its preceding LF does not create another line beyond this offset.
            LD   DE,(LENGTH)
            PUSH HL
            OR   A
            SBC  HL,DE
            POP  HL
            JR   C,LAYNEXLO
            JR   NZ,LAYNEXMI
            JR   LAYNEXEN
; EditorLayoutNextLookup
LAYNEXLO:
            CALL LAYFINLI
            JR   C,LAYNEXMI
            INC  A
            CALL LAYBOU1
            PUSH HL
            LD   DE,(LENGTH)
            OR   A
            SBC  HL,DE
            POP  HL
            JR   NZ,LAYNEXHI
            LD   A,H
            OR   L
            JR   Z,LAYNEXEN
            PUSH HL
            DEC  HL
            CALL DOCREABY
            CP   10
            POP  HL
            JR   NZ,LAYNEXEN
; EditorLayoutNextHit
LAYNEXHI:
            XOR  A
            RET
; EditorLayoutNextEnd
LAYNEXEN:
            XOR  A
            SCF
            RET
; EditorLayoutNextMiss
LAYNEXMI:
            LD   A,1
            OR   A
            RET

; Set scan column to scan column+one character's visual width, A=byte.
;@ROUTINE in A out A,carry,zero clobbers sign,parity,halfCarry,HL
; EditorLayoutAdvanceColumn
LAYADVCO:
            CP   9
            LD   HL,(LAYSCACO)
            JR   Z,LAYADVTA
            INC  HL
            LD   (LAYSCACO),HL
            LD   A,H
            OR   L
            RET  NZ
            JR   LAYADVCA
; EditorLayoutAdvanceTab
LAYADVTA:
            CALL NAVNEXTA
            LD   (LAYSCACO),HL
            RET  NC
; EditorLayoutAdvanceCarry
LAYADVCA:
            LD   A,(LAYSCACO+2)
            INC  A
            LD   (LAYSCACO+2),A
            RET

; Compare full scan column against current horizontal origin. Carry=column<H.
;@ROUTINE out A,carry,zero clobbers sign,parity,halfCarry,DE,HL
; EditorLayoutCompareHorizontal
LAYCOMHO:
            LD   A,(HORHIG)
            LD   D,A
            LD   A,(LAYSCACO+2)
            CP   D
            RET  NZ
            LD   HL,(LAYSCACO)
            LD   DE,(HOR)
            OR   A
            SBC  HL,DE
            RET

; Return row A's anchor in HL and its 24-bit column in A:DE. Carry means blank.
; RowEnd is the logical content end excluding LF/CRLF. The anchor is normalised
; to current Horizontal; Prepare updates every row before publishing OriginH.
;@ROUTINE in A out A,HL,DE,carry,zero clobbers sign,parity,halfCarry,BC
; EditorLayoutGetRow
LAYGETRO:
            LD   (LAYIND),A
            LD   B,A
            LD   A,(LAYROWCO)
            CP   B
            JP   Z,LAYBLAAB
            JP   C,LAYBLAAB
            LD   A,B
            CALL LAYBOU1
            LD   (SCRATCHA),HL
            LD   A,(LAYIND)
            INC  A
            CALL LAYBOU1
            LD   (LAYROWEN),HL
            LD   DE,(SCRATCHA)
            OR   A
            SBC  HL,DE
            JR   Z,LAYENDRE
            LD   HL,(LAYROWEN)
            DEC  HL
            PUSH HL
            CALL DOCREABY
            POP  HL
            CP   10
            JR   NZ,LAYENDRE
            LD   (LAYROWEN),HL
            LD   DE,(SCRATCHA)
            OR   A
            SBC  HL,DE
            JR   Z,LAYENDRE
            LD   HL,(LAYROWEN)
            DEC  HL
            PUSH HL
            CALL DOCREABY
            POP  HL
            CP   13
            JR   NZ,LAYENDRE
            LD   (LAYROWEN),HL
; EditorLayoutEndReady
LAYENDRE:
            LD   A,(LAYIND)
            CALL LAYANCAD
            LD   E,(HL)
            INC  HL
            LD   D,(HL)
            INC  HL
            LD   A,(HL)
            CP   $FF
            JR   Z,LAYANCCO
            BIT  7,A
            JR   NZ,LAYANCEN
            LD   (LAYSCAPO),DE
            LD   E,A
            LD   D,0
            LD   HL,(LAYORIHO)
            OR   A
            SBC  HL,DE
            LD   (LAYSCACO),HL
            LD   A,(LAYORIHO+2)
            SBC  A,0
            LD   (LAYSCACO+2),A
            JR   LAYSEEDI
; EditorLayoutAnchorEnd
LAYANCEN:
            AND  7
            LD   (LAYSCACO+2),A
            LD   (LAYSCACO),DE
            LD   HL,(LAYROWEN)
            LD   (LAYSCAPO),HL
            JR   LAYSEEDI
; EditorLayoutAnchorCold
LAYANCCO:
            LD   HL,(SCRATCHA)
            LD   (LAYSCAPO),HL
            LD   HL,0
            LD   (LAYSCACO),HL
            XOR  A
            LD   (LAYSCACO+2),A
; EditorLayoutSeekDirection
LAYSEEDI:
            CALL LAYCOMHO
            JR   C,LAYSEEFO
            JR   Z,LAYSEEFO
; EditorLayoutSeekBackward
LAYSEEBA:
            LD   HL,(LAYSCAPO)
            DEC  HL
            LD   (LAYSCAPO),HL
            CALL DOCREABY
            CP   9
            JR   Z,LAYBACTA
            LD   HL,(LAYSCACO)
            LD   DE,1
            OR   A
            SBC  HL,DE
            LD   (LAYSCACO),HL
            LD   A,(LAYSCACO+2)
            SBC  A,0
            LD   (LAYSCACO+2),A
            JR   LAYBACCO
; EditorLayoutBackTab
LAYBACTA:
            ; Recover the tab's start from the preceding printable run modulo8.
            ; This is a named cold backward-tab case, not a per-key prefix scan.
            LD   HL,(LAYSCAPO)
            LD   B,0
; EditorLayoutBackTabLoop
LAYBACT2:
            LD   DE,(SCRATCHA)
            PUSH HL
            OR   A
            SBC  HL,DE
            POP  HL
            JR   Z,LAYBACT1
            DEC  HL
            PUSH HL
            CALL DOCREABY
            POP  HL
            CP   9
            JR   Z,LAYBACT1
            INC  B
            JR   LAYBACT2
; EditorLayoutBackTabColumn
LAYBACT1:
            LD   A,B
            AND  7
            LD   B,A
            LD   A,8
            SUB  B
            LD   E,A
            LD   D,0
            LD   HL,(LAYSCACO)
            OR   A
            SBC  HL,DE
            LD   (LAYSCACO),HL
            LD   A,(LAYSCACO+2)
            SBC  A,0
            LD   (LAYSCACO+2),A
; EditorLayoutBackCompare
LAYBACCO:
            CALL LAYCOMHO
            JR   C,LAYSEEFO
            JR   NZ,LAYSEEBA
; EditorLayoutSeekForward
LAYSEEFO:
            LD   HL,(LAYSCAPO)
            LD   DE,(LAYROWEN)
            OR   A
            SBC  HL,DE
            JP   Z,LAYSTOEN
            ; Save the start column; the next boundary must exceed H to cover it.
            LD   HL,(LAYSCACO)
            PUSH HL
            LD   A,(LAYSCACO+2)
            PUSH AF
            LD   HL,(LAYSCAPO)
            CALL DOCREABY
            CALL LAYADVCO
            CALL LAYCOMHO
            JR   C,LAYSEETA
            JR   Z,LAYSEETA
            POP  AF
            LD   (LAYSCACO+2),A
            POP  HL
            LD   (LAYSCACO),HL
            JR   LAYSTONO
; EditorLayoutSeekTake
LAYSEETA:
            POP  AF
            POP  HL
            LD   HL,(LAYSCAPO)
            INC  HL
            LD   (LAYSCAPO),HL
            JR   LAYSEEFO
; EditorLayoutStoreNormal
LAYSTONO:
            LD   HL,(HOR)
            LD   DE,(LAYSCACO)
            OR   A
            SBC  HL,DE
            LD   B,L
            LD   A,(LAYIND)
            CALL LAYANCAD
            LD   DE,(LAYSCAPO)
            LD   (HL),E
            INC  HL
            LD   (HL),D
            INC  HL
            LD   (HL),B
            OR   A
            JR   LAYROWRE
; EditorLayoutStoreEnd
LAYSTOEN:
            LD   A,(LAYIND)
            CALL LAYANCAD
            LD   DE,(LAYSCACO)
            LD   (HL),E
            INC  HL
            LD   (HL),D
            INC  HL
            LD   A,(LAYSCACO+2)
            OR   $80
            LD   (HL),A
            SCF
; EditorLayoutRowReturn
LAYROWRE:
            LD   HL,(LAYSCAPO)
            LD   DE,(LAYSCACO)
            LD   A,(LAYSCACO+2)
            RET
; EditorLayoutBlankAbsent
LAYBLAAB:
            LD   HL,(LENGTH)
            LD   (LAYROWEN),HL
            LD   DE,0
            XOR  A
            SCF
            RET

; 24-bit cursor column. Warm local operations scan from a near-left row anchor;
; distant jumps/cache misses use the original, explicit cold navigation scan.
;@ROUTINE out A,HL,carry,zero clobbers sign,parity,halfCarry,BC,DE
; EditorLayoutCursorColumn
LAYCURC1:
            LD   A,(DOCPENCH)
            OR   A
            JR   NZ,LAYCURCO
            LD   A,(LAYFLA)
            AND  2
            JR   Z,LAYCURLO
            LD   HL,(LAYCUR)
            LD   DE,(CURSOR)
            OR   A
            SBC  HL,DE
            JR   Z,LAYCURCA
; EditorLayoutCursorLocate
LAYCURLO:
            LD   HL,(CURSOR)
            CALL LAYFINLI
            JR   C,LAYCURCO
            LD   (LAYCURRO),A
            CALL LAYGETRO
            ; GetRow has already loaded ScanPointer/ScanColumn.
            LD   HL,(CURSOR)
            LD   DE,(LAYSCAPO)
            OR   A
            SBC  HL,DE
            JR   C,LAYCURCO
; EditorLayoutCursorScan
LAYCURSC:
            LD   HL,(LAYSCAPO)
            LD   DE,(CURSOR)
            OR   A
            SBC  HL,DE
            JR   Z,LAYCURS1
            LD   HL,(LAYSCAPO)
            CALL DOCREABY
            CALL LAYADVCO
            LD   HL,(LAYSCAPO)
            INC  HL
            LD   (LAYSCAPO),HL
            JR   LAYCURSC
; EditorLayoutCursorScanDone
LAYCURS1:
            LD   HL,(LAYSCACO)
            LD   A,(LAYSCACO+2)
            JR   LAYCURST
; EditorLayoutCursorCold
LAYCURCO:
            CALL NAVCURC1
            PUSH AF
            LD   A,$FF
            LD   (LAYCURRO),A
            POP  AF
; EditorLayoutCursorStore
LAYCURST:
            LD   (LAYCOL),HL
            LD   (LAYCOL+2),A
            LD   HL,(CURSOR)
            LD   (LAYCUR),HL
            LD   HL,LAYFLA
            SET  1,(HL)
; EditorLayoutCursorCached
LAYCURCA:
            LD   HL,(LAYCOL)
            LD   A,(LAYCOL+2)
            OR   A
            RET

; Write boundary A from DE; public consumers only read boundary storage.
;@ROUTINE in A,DE out A,HL clobbers carry,zero,sign,parity,halfCarry
; EditorLayoutWriteBoundary
LAYWRIBO:
            ADD  A,A
            LD   L,A
            LD   H,0
            PUSH DE
            LD   DE,LAYBOU
            ADD  HL,DE
            POP  DE
            LD   (HL),E
            INC  HL
            LD   (HL),D
            RET

; Cold boundary discovery uses raw line scans exactly once per visible line.
; RowCount distinguishes a valid trailing empty line from absent screen rows.
;@ROUTINE out A,carry,zero clobbers sign,parity,halfCarry,BC,DE,HL
; EditorLayoutBuild
LAYBUI:
            XOR  A
            LD   (LAYFLA),A
            LD   (LAYIND),A
            LD   DE,(TOP)
            CALL LAYWRIBO
; EditorLayoutBuildRow
LAYBUIRO:
            LD   A,(LAYIND)
            CALL LAYBOU1
            CALL NAVNEXLI
            PUSH AF
            EX   DE,HL
            LD   A,(LAYIND)
            INC  A
            CALL LAYWRIBO
            POP  AF
            JR   C,LAYBUIDO
            LD   A,(LAYIND)
            INC  A
            CP   23
            JR   Z,LAYBUIFU
            LD   (LAYIND),A
            JR   LAYBUIRO
; EditorLayoutBuildDone
LAYBUIDO:
            LD   A,(LAYIND)
            INC  A
; EditorLayoutBuildFull
LAYBUIFU:
            LD   (LAYROWCO),A
            LD   HL,LAYANC
            LD   DE,LAYANC+1
            LD   BC,68
            LD   (HL),$FF
            LDIR
            LD   HL,(TOP)
            LD   (LAYORITO),HL
            LD   A,1
            LD   (LAYFLA),A
            RET

; Apply one no-newline change to old byte anchors. The active line start has
; left affinity; later boundaries move by byte delta. END words are columns,
; never offsets. An active anchor after an arbitrary edit is rediscovered.
;@ROUTINE out A,carry,zero clobbers sign,parity,halfCarry,BC,DE,HL
; EditorLayoutAdjustSingle
LAYADJSI:
            LD   HL,(DOCCHAIN)
            LD   DE,(DOCCHARE)
            OR   A
            SBC  HL,DE
            LD   (LAYDEL),HL
            LD   A,(LAYFIR)
            INC  A
            LD   (LAYIND),A
; EditorLayoutAdjustBoundary
LAYADJBO:
            LD   A,(LAYIND)
            CALL LAYBOU1
            LD   DE,(LAYDEL)
            ADD  HL,DE
            EX   DE,HL
            LD   A,(LAYIND)
            CALL LAYWRIBO
            LD   A,(LAYIND)
            LD   B,A
            LD   A,(LAYROWCO)
            CP   B
            JR   Z,LAYADJA1
            LD   A,B
            INC  A
            LD   (LAYIND),A
            JR   LAYADJBO
; EditorLayoutAdjustAnchors
LAYADJA1:
            LD   A,(LAYFIR)
            LD   (LAYIND),A
; EditorLayoutAdjustAnchor
LAYADJAN:
            LD   A,(LAYIND)
            CALL LAYANCAD
            LD   E,(HL)
            INC  HL
            LD   D,(HL)
            INC  HL
            LD   A,(LAYIND)
            LD   B,A
            LD   A,(LAYFIR)
            CP   B
            JR   NZ,LAYADJLA
            BIT  7,(HL)
            JR   NZ,LAYINVAN
            PUSH HL
            EX   DE,HL
            LD   DE,(DOCCHAST)
            OR   A
            SBC  HL,DE
            POP  HL
            JR   C,LAYADJNE
            JR   Z,LAYADJNE
; EditorLayoutInvalidateAnchor
LAYINVAN:
            LD   (HL),$FF
            JR   LAYADJNE
; EditorLayoutAdjustLater
LAYADJLA:
            BIT  7,(HL)
            JR   NZ,LAYADJNE
            PUSH HL
            EX   DE,HL
            LD   DE,(LAYDEL)
            ADD  HL,DE
            EX   DE,HL
            POP  HL
            DEC  HL
            LD   (HL),D
            DEC  HL
            LD   (HL),E
; EditorLayoutAdjustNext
LAYADJNE:
            LD   A,(LAYIND)
            INC  A
            LD   (LAYIND),A
            LD   B,A
            LD   A,(LAYROWCO)
            CP   B
            JR   NZ,LAYADJAN
            LD   HL,LAYFLA
            RES  1,(HL)
            RET

; Prepare layout and return A damage:0 cursor/status only,1 one row,2 suffix,
; 3 full text rectangle; B first affected row. No screen output occurs here.
;@ROUTINE out A,B,carry,zero clobbers sign,parity,halfCarry,C,DE,HL
; EditorLayoutPrepare
LAYPRE:
            XOR  A
            LD   (LAYDAM),A
            LD   (LAYFIR),A
            LD   A,(LAYFLA)
            AND  1
            JP   Z,LAYPREFU
            LD   A,(DOCPENCH)
            CP   2
            JP   NC,LAYPREFU
            OR   A
            JR   Z,LAYPREVI
            LD   A,(DOCCHAFL)
            AND  1
            JP   Z,LAYPREFU
            LD   HL,(DOCCHAST)
            CALL LAYFINOL
            JP   C,LAYPREFU
            LD   (LAYFIR),A
            LD   A,(DOCCHAFL)
            AND  2
            JR   NZ,LAYPRESU
            LD   A,1
            LD   (LAYDAM),A
            CALL LAYADJSI
            CALL DOCACKCH
; EditorLayoutPrepareViewport
LAYPREVI:
            CALL ENSVIE
            LD   HL,(TOP)
            LD   DE,(LAYORITO)
            OR   A
            SBC  HL,DE
            JR   Z,LAYCHEHO
            LD   A,3
            LD   (LAYDAM),A
            CALL LAYBUI
            JR   LAYNOR
; EditorLayoutPrepareSuffix
LAYPRESU:
            LD   A,2
            LD   (LAYDAM),A
            JR   LAYPRECO
; EditorLayoutPrepareFull
LAYPREFU:
            LD   A,3
            LD   (LAYDAM),A
; EditorLayoutPrepareCold
LAYPRECO:
            XOR  A
            LD   (LAYFLA),A
            CALL ENSVIE
            LD   HL,(TOP)
            LD   DE,(LAYORITO)
            OR   A
            SBC  HL,DE
            JR   Z,LAYCOLBU
            LD   A,3
            LD   (LAYDAM),A
; EditorLayoutColdBuild
LAYCOLBU:
            CALL LAYBUI
            CALL DOCACKCH
            JR   LAYNORCH
; EditorLayoutCheckHorizontal
LAYCHEHO:
            LD   A,(HORHIG)
            LD   B,A
            LD   A,(LAYORIHO+2)
            CP   B
            JR   NZ,LAYHORCH
            LD   HL,(HOR)
            LD   DE,(LAYORIHO)
            OR   A
            SBC  HL,DE
            JR   Z,LAYPRE1
; EditorLayoutHorizontalChanged
LAYHORCH:
            LD   A,3
            LD   (LAYDAM),A
            JR   LAYNOR
; EditorLayoutNormalizeCheck
LAYNORCH:
            LD   A,(HORHIG)
            LD   B,A
            LD   A,(LAYORIHO+2)
            CP   B
            JR   NZ,LAYHORCH
            LD   HL,(HOR)
            LD   DE,(LAYORIHO)
            OR   A
            SBC  HL,DE
            JR   NZ,LAYHORCH
; EditorLayoutNormalize
LAYNOR:
            XOR  A
            LD   (LAYIND),A
; EditorLayoutNormalizeRow
LAYNORRO:
            LD   A,(LAYIND)
            CALL LAYGETRO
            LD   A,(LAYIND)
            INC  A
            LD   (LAYIND),A
            LD   B,A
            LD   A,(LAYROWCO)
            CP   B
            JR   NZ,LAYNORRO
            LD   HL,(HOR)
            LD   (LAYORIHO),HL
            LD   A,(HORHIG)
            LD   (LAYORIHO+2),A
; EditorLayoutPrepared
LAYPRE1:
            CALL DOCACKCH
            LD   A,(LAYFIR)
            LD   B,A
            LD   A,(LAYDAM)
            CP   3
            JR   NZ,LAYPRERE
            LD   B,0
; EditorLayoutPreparedReturn
LAYPRERE:
            OR   A
            RET
; EditorLayoutCodeEnd
LAYCODEN:
