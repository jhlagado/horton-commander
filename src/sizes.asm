; Increment 13: approximate logical sizes for the visible panel rows.
; CP/M directory entries hold the record counts for each file extent. A
; second directory pass combines extents for visible files without opening
; each file separately.

SCNSZES:
    LD A,(SCNROWS)
    OR A
    RET Z

    ; SCAN has cached the visible first extents. Walk the directory again so
    ; later extents count even when their slots precede the first extent.
    LD HL,(FCBP)
    LD DE,12
    ADD HL,DE
    LD B,24
    XOR A
SCZCLR:
    LD (HL),A
    INC HL
    DJNZ SCZCLR
    LD HL,(FCBP)
    LD DE,12
    ADD HL,DE
    LD (HL),'?'
    LD DE,DMA
    LD C,26
    CALL 5
    LD DE,(FCBP)
    LD C,17
    CALL 5
    LD (HIT),A
    CP $FF
    JR Z,SCZCONV
SCZDIRLP:
    CALL ENTRYADR
    LD (SCZDIR),HL
    CALL SCZEXT
    LD C,18
    CALL 5
    LD (HIT),A
    CP $FF
    JR NZ,SCZDIRLP

SCZCONV:
    LD A,(SCNROWS)
    LD (SCZROWS),A
    LD HL,(CACHEP)
    LD (SCZPTR),HL
SCZCONLP:
    ; Convert rounded-up 128-byte records to whole KiB: ceil(records / 8).
    LD HL,(SCZPTR)
    LD DE,11
    ADD HL,DE
    LD E,(HL)
    INC HL
    LD D,(HL)
    EX DE,HL
    LD BC,7
    ADD HL,BC
    SRL H
    RR L
    SRL H
    RR L
    SRL H
    RR L
    LD (SCZSIZE),HL
    LD HL,(SCZPTR)
    LD DE,11
    ADD HL,DE
    LD DE,(SCZSIZE)
    LD (HL),E
    INC HL
    LD (HL),D

    LD HL,(SCZPTR)
    LD DE,CACHSTR
    ADD HL,DE
    LD (SCZPTR),HL
    LD A,(SCZROWS)
    DEC A
    LD (SCZROWS),A
    JP NZ,SCZCONLP
    RET

; If this directory entry belongs to a visible file, retain its greatest
; logical record endpoint. CP/M extent numbers are S2:EX for the qualified
; EXM=0 profile; each extent contributes 128 records before its RC count.
SCZEXT:
    LD HL,(SCZDIR)
    LD A,(HL)
    OR A
    RET NZ
    LD A,(SCNROWS)
    OR A
    RET Z
    LD (SCZROWS),A
    LD HL,(CACHEP)
    LD (SCZPTR),HL
SCZEXTLP:
    LD HL,(SCZDIR)
    INC HL
    LD DE,(SCZPTR)
    LD B,11
SCZCMPLP:
    LD A,(DE)
    CP (HL)
    JR NZ,SCZEXTNX
    INC HL
    INC DE
    DJNZ SCZCMPLP

    ; H:L = ((S2 * 32 + EX) * 128) + RC.
    LD HL,(SCZDIR)
    LD DE,12
    ADD HL,DE
    LD A,(HL)
    AND $1F
    LD B,A
    SRL A
    LD H,A
    LD A,B
    AND 1
    RRCA
    LD L,A
    LD (SCZSIZE),HL

    LD HL,(SCZDIR)
    LD DE,14
    ADD HL,DE
    LD A,(HL)
    AND $0F
    RLCA
    RLCA
    RLCA
    RLCA
    LD B,A
    LD HL,(SCZSIZE)
    LD A,H
    ADD A,B
    LD H,A
    LD (SCZSIZE),HL

    LD HL,(SCZDIR)
    LD DE,15
    ADD HL,DE
    LD A,(HL)
    LD B,A
    LD HL,(SCZSIZE)
    LD A,L
    ADD A,B
    LD L,A
    JR NC,SCZRECS
    INC H
SCZRECS:
    LD (SCZSIZE),HL

    ; The largest extent endpoint wins even if directory slots are unordered.
    LD HL,(SCZPTR)
    LD DE,11
    ADD HL,DE
    LD E,(HL)
    INC HL
    LD D,(HL)
    LD HL,(SCZSIZE)
    LD A,H
    CP D
    JR C,SZRET
    JR NZ,SZSET
    LD A,L
    CP E
    JR C,SZRET
    JR NZ,SZSET
SZRET:
    RET
SZSET:
    LD HL,(SCZPTR)
    LD DE,11
    ADD HL,DE
    LD DE,(SCZSIZE)
    LD (HL),E
    INC HL
    LD (HL),D
    RET

SCZEXTNX:
    LD HL,(SCZPTR)
    LD DE,CACHSTR
    ADD HL,DE
    LD (SCZPTR),HL
    LD A,(SCZROWS)
    DEC A
    LD (SCZROWS),A
    JP NZ,SCZEXTLP
    RET

; Each cache row holds eleven name bytes followed by its approximate KiB
; value. The blank marker compares both bytes so a valid 32 KiB value ($0020)
; remains visible.
LEFTSIZE:
    LD HL,(LPTR)
    LD DE,11
    ADD HL,DE
    JR PRTPSIZ
RGTSIZE:
    LD HL,(RPTR)
    LD DE,11
    ADD HL,DE
PRTPSIZ:
    LD (SIZPTR),HL
    LD A,(HL)
    LD E,A
    INC HL
    LD A,(HL)
    LD D,A
    CP $20
    JR NZ,PSNOTBK
    LD A,E
    CP $20
    JR Z,PSBLANK
PSNOTBK:
    LD H,D
    LD L,E
    LD A,'~'
    CALL PUTCH
    LD DE,$03E8
    CALL DSDIGIT
    LD DE,$0064
    CALL DSDIGIT
    LD DE,$000A
    CALL DSDIGIT
    LD DE,$0001
    CALL DSDIGIT
    LD A,'K'
    JP PUTCH
PSBLANK:
    LD DE,SIZEBLK
    JP PRINTS

PAD20:
    DB "                    ","$"
SIZEBLK:
    DB "      $"
SCZPTR:
    DW 0
SCZDIR:
    DW 0
SCZROWS:
    DB 0
SCZSIZE:
    DW 0
SIZPTR:
    DW 0
