; Increment 1: two live CP/M directory panels with bounded page caches.
; Entry $0100, normal return through the CCP-provided stack. All OS access is
; through BDOS. Panel search state is explicit in each FCB; no disk image or
; Triptych host interface is used by the guest program.
ORG $0100

ENTRY:
    CALL RSMARGS
    CP $FF
    JP Z,BADARGS
    OR A
    JR Z,ENTFRESH
    CALL RSMRES
    JP C,ENTQUIT
ENTFRESH:
    CALL REFRESH
    CALL DRAW
    CALL TSCHECK
    LD A,(RSMFALL)
    OR A
    JR Z,KEYLOOP
    LD A,1
    LD (MSG),A
    CALL DRAW
    CALL READKEY
    XOR A
    LD (MSG),A
    CALL DRAW
    JP KEYLOOP

BADARGS:
    LD DE,RSMUSAGE
    CALL PRINTS
ENTQUIT:
    RET

KEYLOOP:
    CALL READKEY
    CP 'q'
    RET Z
    CP 'Q'
    RET Z
    CP 9
    JR Z,SWITCH
    CP '<'
    JP Z,PREVPAGE
    CP '>'
    JP Z,NEXTPAGE
    CP '['
    JP Z,DRVPREV
    CP ']'
    JP Z,DRVNEXT
    CP 13
    JP Z,DOVIEW
    CP 'v'
    JP Z,DOVIEW
    CP 'V'
    JP Z,DOVIEW
    CP 'c'
    JP Z,DOCOPY
    CP 'C'
    JP Z,DOCOPY
    CP 'r'
    JP Z,DORENAME
    CP 'R'
    JP Z,DORENAME
    CP 'm'
    JP Z,DOMOVE
    CP 'M'
    JP Z,DOMOVE
    CP 'd'
    JP Z,DODELETE
    CP 'D'
    JP Z,DODELETE
    CP 'e'
    JP Z,DOEDIT
    CP 'E'
    JP Z,DOEDIT
    CP '!'
    JP Z,DORUN
    CP 27
    JR Z,ESCAPE
    JP KEYLOOP

ESCAPE:
    CALL READKEY
    CP '['
    JP NZ,KEYLOOP
    CALL READKEY
    CP 'A'
    JR Z,MOVEUP
    CP 'B'
    JR Z,MOVEDN
    CP 'C'
    JR Z,SETRIGHT
    CP 'D'
    JR Z,SETLEFT
    JP KEYLOOP

SWITCH:
    LD A,(ACTIVE)
    XOR 1
    LD (ACTIVE),A
    CALL DRAW
    JP KEYLOOP

SETLEFT:
    XOR A
    LD (ACTIVE),A
    CALL DRAW
    JP KEYLOOP

SETRIGHT:
    LD A,1
    LD (ACTIVE),A
    CALL DRAW
    JP KEYLOOP

MOVEUP:
    LD A,(ACTIVE)
    OR A
    JR NZ,UPRIGHT
    LD A,(SELL)
    OR A
    JP Z,KEYLOOP
    DEC A
    LD (SELL),A
    CALL DRAW
    JP KEYLOOP
UPRIGHT:
    LD A,(SELR)
    OR A
    JP Z,KEYLOOP
    DEC A
    LD (SELR),A
    CALL DRAW
    JP KEYLOOP

MOVEDN:
    LD A,(ACTIVE)
    OR A
    JR NZ,DOWNR
    LD A,(SELL)
    INC A
    LD B,A
    LD A,(ROWL)
    CP B
    JP C,KEYLOOP
    JP Z,KEYLOOP
    LD A,B
    LD (SELL),A
    CALL DRAW
    JP KEYLOOP
DOWNR:
    LD A,(SELR)
    INC A
    LD B,A
    LD A,(ROWR)
    CP B
    JP C,KEYLOOP
    JP Z,KEYLOOP
    LD A,B
    LD (SELR),A
    CALL DRAW
    JP KEYLOOP

PREVPAGE:
    LD A,(ACTIVE)
    OR A
    JR NZ,PREVR
    LD HL,(PAGEL)
    LD A,H
    OR L
    JP Z,KEYLOOP
    LD DE,18
    OR A
    SBC HL,DE
    JR NC,PREVLSET
    LD HL,0
PREVLSET:
    LD (PAGEL),HL
    XOR A
    LD (SELL),A
    CALL REFRESH
    CALL DRAW
    JP KEYLOOP
PREVR:
    LD HL,(PAGER)
    LD A,H
    OR L
    JP Z,KEYLOOP
    LD DE,18
    OR A
    SBC HL,DE
    JR NC,PREVRSET
    LD HL,0
PREVRSET:
    LD (PAGER),HL
    XOR A
    LD (SELR),A
    CALL REFRESH
    CALL DRAW
    JP KEYLOOP

NEXTPAGE:
    LD A,(ACTIVE)
    OR A
    JR NZ,NEXTR
    LD HL,(PAGEL)
    LD DE,18
    ADD HL,DE
    LD DE,(COUNTL)
    OR A
    SBC HL,DE
    JP NC,KEYLOOP
    LD HL,(PAGEL)
    LD DE,18
    ADD HL,DE
    LD (PAGEL),HL
    XOR A
    LD (SELL),A
    CALL REFRESH
    CALL DRAW
    JP KEYLOOP
NEXTR:
    LD HL,(PAGER)
    LD DE,18
    ADD HL,DE
    LD DE,(COUNTR)
    OR A
    SBC HL,DE
    JP NC,KEYLOOP
    LD HL,(PAGER)
    LD DE,18
    ADD HL,DE
    LD (PAGER),HL
    XOR A
    LD (SELR),A
    CALL REFRESH
    CALL DRAW
    JP KEYLOOP

; Change only the active panel's explicit drive. The other panel retains its
; drive, page and selection. The four-drive Triptych profile is A: through D:.
DRVPREV:
    LD A,(ACTIVE)
    OR A
    JR NZ,DPREVRG
    LD HL,FCBL
    LD A,(FCBL)
    DEC A
    JR NZ,DPREVL
    LD A,4
DPREVL:
    LD (HL),A
    LD HL,0
    LD (PAGEL),HL
    XOR A
    LD (SELL),A
    JP DRVREF
DPREVRG:
    LD A,(FCBR)
    DEC A
    JR NZ,DPREVRS
    LD A,4
DPREVRS:
    LD (FCBR),A
    LD HL,0
    LD (PAGER),HL
    XOR A
    LD (SELR),A
    JP DRVREF

DRVNEXT:
    LD A,(ACTIVE)
    OR A
    JR NZ,DNEXERG
    LD A,(FCBL)
    INC A
    CP 5
    JR C,DNEXTL
    LD A,1
DNEXTL:
    LD (FCBL),A
    LD HL,0
    LD (PAGEL),HL
    XOR A
    LD (SELL),A
    JP DRVREF
DNEXERG:
    LD A,(FCBR)
    INC A
    CP 5
    JR C,DNEXERS
    LD A,1
DNEXERS:
    LD (FCBR),A
    LD HL,0
    LD (PAGER),HL
    XOR A
    LD (SELR),A
DRVREF:
    CALL REFRESH
    CALL DRAW
    JP KEYLOOP

; Copy the selected cached 8.3 name into a private FCB, then open and size it.
; BDOS returns ordinary open failures; fatal media errors still warm-boot.
DOVIEW:
    LD A,(ACTIVE)
    OR A
    JR NZ,VIEWRSEL
    LD A,(SELL)
    LD B,A
    LD A,(ROWL)
    CP B
    JP C,NOSELECT
    JP Z,NOSELECT
    LD A,(FCBL)
    LD (VFCB),A
    LD A,(SELL)
    LD HL,CACHEL
    JR VIEWNAME
VIEWRSEL:
    LD A,(SELR)
    LD B,A
    LD A,(ROWR)
    CP B
    JP C,NOSELECT
    JP Z,NOSELECT
    LD A,(FCBR)
    LD (VFCB),A
    LD A,(SELR)
    LD HL,CACHER
VIEWNAME:
    LD DE,11
    OR A
    JR Z,VIEWCOPY
VIEWSKIP:
    ADD HL,DE
    DEC A
    JR NZ,VIEWSKIP
VIEWCOPY:
    LD DE,VFCB+1
    LD BC,11
    LDIR
    LD HL,VFCB+12
    LD B,24
    XOR A
VCLR:
    LD (HL),A
    INC HL
    DJNZ VCLR
    LD DE,VFCB
    LD C,15
    CALL 5
    CP $FF
    JP Z,VIEWMISS
    LD DE,VFCB
    LD C,35
    CALL 5
    LD HL,(VFCB+33)
    LD (VSIZE),HL
    LD A,(VFCB+35)
    OR A
    JP NZ,VIEWBIG
    XOR A
    LD (VSTART),A
    LD (VSTART+1),A
    XOR A
    LD (VEOF),A
    LD (VERR),A
    CALL VIEWDRAW
VIEWKEY:
    CALL READKEY
    CP 27
    JR Z,VIEWESC
    CP 'q'
    JP Z,VIEWRET
    CP 'Q'
    JP Z,VIEWRET
    CP '<'
    JR Z,VIEWBACK
    CP ' '
    JR Z,VIEWFWD
    CP '>'
    JR NZ,VIEWKEY
VIEWFWD:
    LD A,(VEOF)
    OR A
    JR NZ,VIEWKEY
    LD HL,(VSTART)
    LD DE,9
    ADD HL,DE
    LD DE,(VSIZE)
    OR A
    SBC HL,DE
    JR NC,VIEWKEY
    LD HL,(VSTART)
    LD (VPREV),HL
    LD DE,9
    ADD HL,DE
    LD (VSTART),HL
    XOR A
    LD (VEOF),A
    CALL VIEWDRAW
    JR VIEWKEY
; Escape is also the first byte of Triptych's arrow keys. Poll briefly for the
; rest of a CSI sequence. BDOS function 11 buffers a pending byte for READKEY.
VIEWESC:
    LD A,255
    LD (VESCWAIT),A
VIEWPOLL:
    LD C,11
    CALL 5
    OR A
    JR NZ,VIEWSEQ
    LD A,(VESCWAIT)
    DEC A
    LD (VESCWAIT),A
    JR NZ,VIEWPOLL
    JP VIEWRET
VIEWSEQ:
    CALL READKEY
    CP '['
    JR NZ,VIEWKEY
    CALL READKEY
    CP 'A'
    JR Z,VIEWBACK
    CP 'D'
    JR Z,VIEWBACK
    CP 'B'
    JR Z,VIEWFWD
    CP 'C'
    JR Z,VIEWFWD
    JR VIEWKEY
VIEWBACK:
    LD HL,(VSTART)
    LD A,H
    OR L
    JP Z,VIEWKEY
    LD HL,(VSTART)
    LD DE,9
    OR A
    SBC HL,DE
    JR NC,VBSET
    LD HL,0
VBSET:
    LD (VPREV),HL
    LD (VSTART),HL
    XOR A
    LD (VEOF),A
    CALL VIEWDRAW
    JP VIEWKEY
VIEWRET:
    LD A,0
    LD (MSG),A
    CALL DRAW
    JP KEYLOOP
VIEWMISS:
    LD A,1
    LD (MSG),A
    CALL DRAW
    CALL READKEY
    XOR A
    LD (MSG),A
    CALL DRAW
    JP KEYLOOP
VIEWBIG:
    LD A,2
    LD (MSG),A
    CALL DRAW
    CALL READKEY
    XOR A
    LD (MSG),A
    CALL DRAW
    JP KEYLOOP
NOSELECT:
    LD A,3
    LD (MSG),A
    CALL DRAW
    CALL READKEY
    XOR A
    LD (MSG),A
    CALL DRAW
    JP KEYLOOP

; Read one nonzero byte with CP/M BDOS direct console input, function 6.
; Clobbers AF, BC, DE, HL. No console echo is assumed.
READKEY:
    LD C,6
    LD E,$FF
    CALL 5
    OR A
    JR Z,READKEY
    RET

; Refresh each panel independently. Each cache holds only eighteen names.
REFRESH:
    LD HL,PAGEL
    LD (SCNSTA),HL
    LD HL,COUNTL
    LD (SCNCNT),HL
    LD HL,ROWL
    LD (SCNROW),HL
    LD HL,CACHEL
    LD (SCNCAC),HL
    LD HL,FCBL
    LD (SCNFCB),HL
    CALL SCAN

    LD HL,PAGER
    LD (SCNSTA),HL
    LD HL,COUNTR
    LD (SCNCNT),HL
    LD HL,ROWR
    LD (SCNROW),HL
    LD HL,CACHER
    LD (SCNCAC),HL
    LD HL,FCBR
    LD (SCNFCB),HL
    CALL SCAN
    RET

; Scan current user on one explicitly selected drive. Only EX=0 entries are
; listed; the selected two-MiB DPB has EXM=0, so that is one row per file.
; SCNSTA points to the page start; SCNCNT/SCNROW receive totals.
SCAN:
    LD HL,(SCNCAC)
    LD (CACHEP),HL
    LD HL,(SCNFCB)
    LD (FCBP),HL
    LD HL,(SCNSTA)
    LD A,(HL)
    INC HL
    LD H,(HL)
    LD L,A
    LD (SCNSTART),HL
    XOR A
    LD (SCNROWS),A
    LD (SCNCOUNT),A
    LD (SCNCOUNT+1),A

    LD HL,(CACHEP)
    LD B,198
    LD A,' '
CLRCACH:
    LD (HL),A
    INC HL
    DJNZ CLRCACH

    LD DE,DMA
    LD C,26
    CALL 5
    LD DE,(FCBP)
    LD C,17
    CALL 5
    LD (HIT),A
    CP $FF
    JR Z,SCNDONE

SCNLOOP:
    CALL ENTRYADR
    LD A,(HL)
    OR A
    JR NZ,SCNNEXT
    LD DE,12
    ADD HL,DE
    LD A,(HL)
    OR A
    JR NZ,SCNNEXT

    LD HL,(SCNCOUNT)
    LD DE,(SCNSTART)
    OR A
    SBC HL,DE
    JR C,SCNCTUP
    LD A,H
    OR A
    JR NZ,SCNCTUP
    LD A,L
    CP 18
    JR NC,SCNCTUP
    LD (ROWIDX),A
    CALL STOREADR
    LD A,(SCNROWS)
    INC A
    LD (SCNROWS),A

SCNCTUP:
    LD HL,(SCNCOUNT)
    INC HL
    LD (SCNCOUNT),HL
SCNNEXT:
    LD C,18
    CALL 5
    LD (HIT),A
    CP $FF
    JR NZ,SCNLOOP

SCNDONE:
    LD HL,(SCNCOUNT)
    LD DE,(SCNCNT)
    LD A,L
    LD (DE),A
    INC DE
    LD A,H
    LD (DE),A
    LD A,(SCNROWS)
    LD DE,(SCNROW)
    LD (DE),A
    RET

; Return HL at the 32-byte directory slot selected in HIT.
ENTRYADR:
    LD HL,0
    LD A,(HIT)
    LD B,A
    LD DE,32
    LD A,B
    OR A
    JR Z,ENTADD
ENTLOOP:
    ADD HL,DE
    DJNZ ENTLOOP
ENTADD:
    LD DE,DMA
    ADD HL,DE
    RET

; Copy the current entry's eleven name/type bytes into this page's row cache.
STOREADR:
    LD A,(ROWIDX)
    LD HL,0
    LD DE,11
    OR A
    JR Z,STOREDST
STOREOFF:
    ADD HL,DE
    DEC A
    JR NZ,STOREOFF
STOREDST:
    LD DE,(CACHEP)
    ADD HL,DE
    LD (DSTPTR),HL
    CALL ENTRYADR
    INC HL
    LD DE,(DSTPTR)
    LD BC,11
    LDIR
    RET

; Draw a complete 80x24 panel screen. ANSI output is the Triptych terminal
; boundary; file access and input remain ordinary BDOS calls.
DRAW:
    LD DE,CLEAR
    CALL PRINTS
    LD DE,TITLE
    CALL PRINTS
    LD DE,HEAD1
    CALL PRINTS
    LD A,(FCBL)
    ADD A,64
    CALL PUTCH
    LD DE,HEAD2
    CALL PRINTS
    LD A,(FCBR)
    ADD A,64
    CALL PUTCH
    LD DE,HEAD3
    CALL PRINTS
    LD DE,BORDER
    CALL PRINTS
    LD HL,CACHEL
    LD (LPTR),HL
    LD HL,CACHER
    LD (RPTR),HL
    XOR A
    LD (DRAWROW),A

DRAWLOOP:
    LD A,(DRAWROW)
    CP 18
    JP NC,DRAWEND
    LD A,'|'
    CALL PUTCH

    LD A,(ACTIVE)
    OR A
    JR NZ,LEFTPLN
    LD A,(DRAWROW)
    LD B,A
    LD A,(SELL)
    CP B
    JR NZ,LEFTPLN
    LD DE,REVERSE
    CALL PRINTS
    CALL LEFTNAME
    LD DE,PAD26
    CALL PRINTS
    LD DE,NORMAL
    CALL PRINTS
    JR LEFTDONE
LEFTPLN:
    CALL LEFTNAME
    LD DE,PAD26
    CALL PRINTS
LEFTDONE:
    LD A,'|'
    CALL PUTCH
    LD A,'|'
    CALL PUTCH

    LD A,(ACTIVE)
    OR A
    JR Z,RIGHTPLN
    LD A,(DRAWROW)
    LD B,A
    LD A,(SELR)
    CP B
    JR NZ,RIGHTPLN
    LD DE,REVERSE
    CALL PRINTS
    CALL RGTNAME
    LD DE,PAD26
    CALL PRINTS
    LD DE,NORMAL
    CALL PRINTS
    JR RGHTDON
RIGHTPLN:
    CALL RGTNAME
    LD DE,PAD26
    CALL PRINTS
RGHTDON:
    LD A,'|'
    CALL PUTCH
    LD DE,CRLF
    CALL PRINTS
    LD HL,(LPTR)
    LD DE,11
    ADD HL,DE
    LD (LPTR),HL
    LD HL,(RPTR)
    LD DE,11
    ADD HL,DE
    LD (RPTR),HL
    LD A,(DRAWROW)
    INC A
    LD (DRAWROW),A
    JP DRAWLOOP

DRAWEND:
    LD DE,BORDER
    CALL PRINTS
    LD A,(MSG)
    OR A
    JP Z,DRAWSTAT
    CP 1
    JP Z,DRAWMISS
    CP 2
    JP Z,DRAWBIG
    CP 3
    JP Z,DRNOSEL
    CP 4
    JP Z,DRCOPYAS
    CP 5
    JP Z,DRCOPYOK
    CP 6
    JP Z,DRCOPMIS
    CP 7
    JP Z,DRCOPYEX
    CP 8
    JP Z,DRCOPTM
    CP 9
    JP Z,DRCOPFL
    CP 10
    JP Z,DRVERFL
    CP 11
    JP Z,DRRECOV
    CP 12
    JP Z,DRDLOK
    CP 13
    JP Z,DRDLFL
    CP 14
    JP Z,DRCOPYAS
    CP 15
    JP Z,DRDSKFL
    CP 16
    JP Z,DRDRFL
    CP 18
    JP Z,DRMKFL
    CP 19
    JP Z,DRRENOK
    CP 20
    JP Z,DRRENINV
    CP 21
    JP Z,DRRENEX
    CP 22
    JP Z,DRRENFL
    CP 23
    JP Z,DRMOVEAS
    CP 24
    JP Z,DRMOVOK
    CP 25
    JP Z,DRMOVDEL
    CP 26
    JP Z,DRDELASK
    CP 27
    JP Z,DRDELOK
    CP 28
    JP Z,DRDELFL
    CP 29
    JP Z,DRMSAME
    CP 30
    JP Z,DRRNSAME
    CP 31
    JP Z,DRRSMCOL
    CP 32
    JP Z,DRRSMRO
    CP 33
    JP Z,DRRSMIO
    CP 34
    JP Z,DRRSMUS
    JP DRCLEANF
DRAWMISS:
    LD DE,MISSMSG
    JP DRAWMSG
DRAWBIG:
    LD DE,BIGMSG
    JP DRAWMSG
DRNOSEL:
    LD DE,NOSELMSG
    JP DRAWMSG
DRCOPYAS:
    LD DE,CPASKMSG
    JP DRAWMSG
DRCOPYOK:
    LD DE,CPOKMSG
    JP DRAWMSG
DRCOPMIS:
    LD DE,CPMISMSG
    JP DRAWMSG
DRCOPYEX:
    LD DE,CPEXMSG
    JP DRAWMSG
DRCOPTM:
    LD DE,CPTMPMSG
    JP DRAWMSG
DRCOPFL:
    LD DE,CPFAILMS
    JP DRAWMSG
DRVERFL:
    LD DE,VRFYMSG
    JP DRAWMSG
DRRECOV:
    LD DE,TMPFD1
    CALL PRINTS
    LD A,(TDRIVE)
    ADD A,64
    CALL PUTCH
    LD DE,TMPFD2
    CALL PRINTS
    LD A,'$'
    CALL PUTCH
    LD A,'$'
    CALL PUTCH
    LD A,'$'
    CALL PUTCH
    LD DE,TMPFD3
    JP DRAWMSG
DRDLOK:
    LD DE,TEMPDEL1
    CALL PRINTS
    LD A,(TDRIVE)
    ADD A,64
    CALL PUTCH
    LD DE,TMPDOK2
    JP DRAWMSG
DRDLFL:
    LD DE,TEMPDEL1
    CALL PRINTS
    LD A,(TDRIVE)
    ADD A,64
    CALL PUTCH
    LD DE,TMPDFL2
    JP DRAWMSG
DRMKFL:
    LD DE,CPMKMSG
    JP DRAWMSG
DRDSKFL:
    LD DE,CPDSKMSG
    JP DRAWMSG
DRDRFL:
    LD DE,CPDIRMSG
    JP DRAWMSG
DRCLEANF:
    LD DE,CPCLEANM
    JP DRAWMSG
DRRENOK:
    LD DE,RENOKMSG
    JP DRAWMSG
DRRENINV:
    LD DE,RNINVMSG
    JP DRAWMSG
DRRENEX:
    LD DE,RENEXMSG
    JP DRAWMSG
DRRENFL:
    LD DE,RENFAILM
    JP DRAWMSG
DRMOVEAS:
    LD DE,MOVEASKM
    JP DRAWMSG
DRMOVOK:
    LD DE,MOVEOKM
    JP DRAWMSG
DRMOVDEL:
    LD DE,MOVEDELM
    JP DRAWMSG
DRDELASK:
    LD DE,DELASKMS
    JP DRAWMSG
DRDELOK:
    LD DE,DELOKMSG
    JP DRAWMSG
DRDELFL:
    LD DE,DELFAILM
    JP DRAWMSG
DRMSAME:
    LD DE,MOVESAME
    JP DRAWMSG
DRRNSAME:
    LD DE,RENUNCHM
    JP DRAWMSG
DRRSMCOL:
    LD DE,RSMCOLL
    JP DRAWMSG
DRRSMRO:
    LD DE,RSMROM
    JP DRAWMSG
DRRSMIO:
    LD DE,RSMIOMSG
    JP DRAWMSG
DRRSMUS:
    LD DE,RSMUSRMG
    JP DRAWMSG
DRAWSTAT:
    LD DE,STATUS
DRAWMSG:
    CALL PRINTS
    LD DE,FOOTER
    CALL PRINTS
    RET

; The viewer reads at most nine random-access CP/M records per page. Each
; record is shown as two wrapped 64-column rows; control bytes become spaces,
; non-ASCII bytes become dots, and CP/M text EOF stops the display.
VIEWDRAW:
    LD DE,CLEAR
    CALL PRINTS
    LD DE,VTITLE
    CALL PRINTS
    LD DE,VHEAD1
    CALL PRINTS
    LD A,(VFCB)
    ADD A,64
    CALL PUTCH
    LD DE,VHEAD2
    CALL PRINTS
    LD HL,VFCB+1
    LD (NAMEPTR),HL
    CALL PRINTNAM
    LD DE,CRLF
    CALL PRINTS
    LD DE,BORDER
    CALL PRINTS
    LD HL,(VSTART)
    LD (VREC),HL
    XOR A
    LD (VROW),A
    LD (VERR),A
    LD (VEOF),A

VWPAGE:
    LD A,(VROW)
    CP 9
    JP NC,VWEND
    LD A,(VEOF)
    OR A
    JP NZ,VWBLANK
    LD HL,(VREC)
    LD DE,(VSIZE)
    OR A
    SBC HL,DE
    JP NC,VWEOF
    LD HL,(VREC)
    LD (VFCB+33),HL
    XOR A
    LD (VFCB+35),A
    LD DE,DMA
    LD C,26
    CALL 5
    LD DE,VFCB
    LD C,33
    CALL 5
    OR A
    JR Z,VWREAD
    CP 1
    JP Z,VWEOF
    LD (VERR),A
    LD A,1
    LD (VEOF),A
    JP VWBLANK

VWREAD:
    LD DE,VLEFT
    CALL PRINTS
    LD HL,DMA
    LD B,64
    CALL VPRINT
    LD DE,VRIGHT
    CALL PRINTS
    LD DE,CRLF
    CALL PRINTS
    LD DE,VLEFT
    CALL PRINTS
    LD HL,DMA+64
    LD B,64
    CALL VPRINT
    LD DE,VRIGHT
    CALL PRINTS
    LD DE,CRLF
    CALL PRINTS
    LD HL,(VREC)
    INC HL
    LD (VREC),HL
    LD DE,(VSIZE)
    OR A
    SBC HL,DE
    JR C,VWCOUNT
    LD A,1
    LD (VEOF),A
    JR VWCOUNT

VWEOF:
    LD A,1
    LD (VEOF),A
VWBLANK:
    CALL VBLANK
    CALL VBLANK
VWCOUNT:
    LD A,(VROW)
    INC A
    LD (VROW),A
    JP VWPAGE

VWEND:
    LD DE,BORDER
    CALL PRINTS
    LD A,(VERR)
    OR A
    JR NZ,VWERR
    LD A,(VEOF)
    OR A
    JR NZ,VWEOFMSG
    LD DE,VSTATUS
    JR VWSTAT
VWERR:
    LD DE,VERRMSG
    JR VWSTAT
VWEOFMSG:
    LD DE,VEOFMSG
VWSTAT:
    CALL PRINTS
    LD DE,VFOOT
    CALL PRINTS
    RET

; Print B bytes from HL, replacing CP/M EOF with spaces, control bytes with
; spaces, and high bytes with a visible dot. PUTCH preserves the loop registers.
VPRINT:
    LD A,(VEOF)
    OR A
    JR NZ,VPAD
    LD A,(HL)
    CP 26
    JR NZ,VPCONT
    LD A,1
    LD (VEOF),A
    LD A,' '
    JR VPCHAR
VPCONT:
    CP 32
    JR NC,VPHIGH
    LD A,' '
    JR VPCHAR
VPHIGH:
    CP 127
    JR C,VPCHAR
    LD A,'.'
    JR VPCHAR
VPAD:
    LD A,' '
VPCHAR:
    CALL PUTCH
    INC HL
    DJNZ VPRINT
    RET

VBLANK:
    LD DE,VLEFT
    CALL PRINTS
    LD B,64
VBLLOOP:
    LD A,' '
    CALL PUTCH
    DJNZ VBLLOOP
    LD DE,VRIGHT
    CALL PRINTS
    LD DE,CRLF
    CALL PRINTS
    RET

LEFTNAME:
    LD HL,(LPTR)
    LD (NAMEPTR),HL
    CALL PRINTNAM
    RET

RGTNAME:
    LD HL,(RPTR)
    LD (NAMEPTR),HL
    CALL PRINTNAM
    RET

; Print a fixed twelve-column 8.3 display name from NAMEPTR.
PRINTNAM:
    LD HL,(NAMEPTR)
    LD B,8
NAMEBASE:
    LD A,(HL)
    AND $7F
    CALL PUTCH
    INC HL
    DJNZ NAMEBASE
    LD A,(HL)
    AND $7F
    CP ' '
    JR Z,NOEXT
    LD A,'.'
    CALL PUTCH
    LD B,3
NAMEEXT:
    LD A,(HL)
    AND $7F
    CALL PUTCH
    INC HL
    DJNZ NAMEEXT
    RET
NOEXT:
    LD B,4
EXTSPC:
    LD A,' '
    CALL PUTCH
    DJNZ EXTSPC
    RET

; CP/M BDOS function 2; preserve the caller's iteration registers.
PUTCH:
    PUSH BC
    PUSH DE
    PUSH HL
    LD E,A
    LD C,2
    CALL 5
    POP HL
    POP DE
    POP BC
    RET

; DE points to a dollar-terminated string.
PRINTS:
    LD C,9
    CALL 5
    RET

CLEAR:
    DB 27,"[2J",27,"[H","$"
REVERSE:
    DB 27,"[7m","$"
NORMAL:
    DB 27,"[0m","$"
TITLE:
    DB " HORTON COMMANDER  CP/M two-panel file manager",13,10,"$"
HEAD1:
    DB "| $"
HEAD2:
    DB ": *.*","                               ","|| $"
HEAD3:
    DB ": *.*","                               ","|",13,10,"$"
BORDER:
    DB "+","--------------------------------------","+","+","--------------------------------------","+",13,10,"$"
STATUS:
    DB "Tab panel  Arrows select  [] drives  Enter view  C copy",13,10,"$"
MISSMSG:
    DB "File is no longer present on this drive.",13,10,"$"
BIGMSG:
    DB "File exceeds the viewer's record-address limit.",13,10,"$"
NOSELMSG:
    DB "Select a file before viewing.",13,10,"$"
FOOTER:
    DB "E edit  ! command  R rename  M move  D delete  Q quit",13,10,"$"
CPASKMSG:
    DB "Copy selected name to the other panel's drive? Y/N",13,10,"$"
CPOKMSG:
    DB "Copy verified and complete; both panels refreshed.",13,10,"$"
CPMISMSG:
    DB "Source is no longer on this drive; nothing was copied.",13,10,"$"
CPEXMSG:
    DB "Destination already exists; Horton will not overwrite it.",13,10,"$"
CPTMPMSG:
    DB "Reserved copy temporary exists; restart Horton to review it.",13,10,"$"
CPFAILMS:
    DB "Copy failed; source kept and temporary cleanup attempted.",13,10,"$"
VRFYMSG:
    DB "Copy verification failed; source kept and temp removed if safe.",13,10,"$"
TMPFD1:
    DB "Interrupted copy found on drive $"
TMPFD2:
    DB ": HCOPY.","$"
TMPFD3:
    DB ". Press D to remove it; any other key keeps it.",13,10,"$"
TEMPDEL1:
    DB "Interrupted copy on drive $"
TMPDOK2:
    DB ": removed. Press any key to continue.",13,10,"$"
TMPDFL2:
    DB ": could not be removed. Press any key to continue.",13,10,"$"
CPMKMSG:
    DB "Could not create the copy temporary; directory may be full.",13,10,"$"
CPDSKMSG:
    DB "Disk full during copy; source kept and temp cleanup attempted.",13,10,"$"
CPDIRMSG:
    DB "Directory full during copy; source kept and temp cleanup attempted.",13,10,"$"
CPCLEANM:
    DB "Copy failed; the temporary remains for recovery on the next launch.",13,10,"$"
RENOKMSG:
    DB "File renamed; panel refreshed.",13,10,"$"
RNINVMSG:
    DB "Invalid name; use an 8-character name and 3-character type.",13,10,"$"
RENEXMSG:
    DB "That name already exists; file was not renamed.",13,10,"$"
RENFAILM:
    DB "Rename failed; the file may have changed or the drive is protected.",13,10,"$"
MOVEASKM:
    DB "Move selected file to the other panel's drive? Y/N",13,10,"$"
MOVEOKM:
    DB "Move complete; source deleted after copy verification.",13,10,"$"
MOVEDELM:
    DB "Copy verified; source remains because delete failed.",13,10,"$"
DELASKMS:
    DB "Delete selected file from this drive? Y/N",13,10,"$"
DELOKMSG:
    DB "File deleted; panel refreshed.",13,10,"$"
DELFAILM:
    DB "Delete failed; the file may no longer be present.",13,10,"$"
MOVESAME:
    DB "Move requires different drives; use Rename on one drive.",13,10,"$"
RENUNCHM:
    DB "That is already this file's name; no disk change.",13,10,"$"
RSMCOLL:
    DB "Handoff refused; remove B:HORTON.RSM or B:HORTON.TMP at CCP first.",13,10,"$"
RSMROM:
    DB "Handoff needs writable B: session storage; nothing was started.",13,10,"$"
RSMIOMSG:
    DB "Session write or verification failed; B:HORTON.TMP may need cleanup.",13,10,"$"
RSMUSRMG:
    DB "Handoff currently supports CP/M user area 0 only.",13,10,"$"
RSMUSAGE:
    DB "Usage: HORTON or HORTON /R",13,10,"$"
RSMNOFIL:
    DB "No saved session on B: in user area 0.",13,10,"$"
RSMBADFL:
    DB "Saved session is invalid; it has been left untouched.",13,10,"$"
RSMTMPFL:
    DB "Incomplete B:HORTON.TMP; remove it at CCP before handoff.",13,10,"$"
RSMRERR:
    DB "Could not read the saved session from B:.",13,10,"$"
RSMDERR:
    DB "Could not consume the saved session; no state was restored.",13,10,"$"
RSMSUMM:
    DB "Saved Horton session on B:; confirm the disk and selections.",13,10,"$"
RSMLEFT:
    DB "Left panel, drive $"
RSMRIGHT:
    DB "Right panel, drive $"
RSMDEFLT:
    DB "Previous default drive: $"
RSMSELM:
    DB "Selected: $"
RSMNOSEL:
    DB "(none)$"
RSMCNFRM:
    DB "Resume this session? Y/N: $"
RSMCAN:
    DB "Resume canceled; session kept.",13,10,"$"
RSMDLRO:
    DB "Session file is read-only; it has not been consumed.",13,10,"$"
RSMEDIT1:
    DB "Session saved to B:HORTON.RSM.",13,10,"At the CCP, enter:",13,10,"$"
RSMEDIT2:
    DB "A:EDIT $"
RSMEDIT3:
    DB 13,10,"After Edit returns, restore the previous drive, then enter:",13,10,"$"
RSMEDIT4:
    DB "A:HORTON /R",13,10,"$"
RSMCMDRW:
    DB 27,"[22;1H",27,"[2K","CCP command, up to 64 chars; Enter accepts, Esc cancels.",13,10,"$"
RSMCMDLN:
    DB 27,"[23;1H",27,"[2K","$"
RSMOUT1:
    DB "Session saved to B:HORTON.RSM.",13,10,"At the CCP, enter:",13,10,"$"
RSMOUT2:
    DB 13,10,"After the command returns, restore the previous drive, then enter:",13,10,"$"
RSMOUT3:
    DB "A:HORTON /R",13,10,"$"
RSMMAGIC:
    DB "HORTONRS"
RSMFINAL:
    DB "HORTON  RSM"
RSMTEMP:
    DB "HORTON  TMP"
RSMWILD:
    DB "???????????"
RENROW:
    DB 27,"[23;1H",27,"[2K","$"
RENPRM:
    DB "New CP/M name (8.3), Enter accepts, Esc cancels: $"
RNCHARS:
    DB "!#$&'-@^_{}~"
VTITLE:
    DB " HORTON COMMANDER - READ ONLY VIEWER",13,10,"$"
VHEAD1:
    DB " Drive $"
VHEAD2:
    DB ": $"
VLEFT:
    DB "|       $"
VRIGHT:
    DB "       |$"
VSTATUS:
    DB "Showing nine 128-byte records as wrapped text.",13,10,"$"
VEOFMSG:
    DB "End of file. Use < to return to the previous page.",13,10,"$"
VERRMSG:
    DB "BDOS returned a read status; Esc returns to the panels.",13,10,"$"
VFOOT:
    DB "Space or >: next page   <: previous page   Esc/Q: return",13,10,"$"
PAD26:
    DB "                          ","$"
CRLF:
    DB 13,10,"$"

; Search FCBs: explicit A: and B:, wildcard 8.3 names, current user area.
FCBL:
    DB 1,"???????????"
    DS 24
FCBR:
    DB 2,"???????????"
    DS 24
DMA:
    DS 128
VDMA:
    DS 128
CACHEL:
    DS 198
CACHER:
    DS 198
VFCB:
    DB 0,"           "
    DS 24
SRCFCB:
    DB 0,"           "
    DS 24
DESTFCB:
    DB 0,"           "
    DS 24
TMPFCB:
    DB 0,"HCOPY   $$$"
    DS 24
TMPNAME:
    DB "HCOPY   $$$"

ACTIVE:
    DB 0
PAGEL:
    DW 0
PAGER:
    DW 0
COUNTL:
    DW 0
COUNTR:
    DW 0
ROWL:
    DB 0
ROWR:
    DB 0
SELL:
    DB 0
SELR:
    DB 0
MSG:
    DB 0
VROW:
    DB 0
VEOF:
    DB 0
VERR:
    DB 0
VESCWAIT:
    DB 0
TDRIVE:
    DB 1
COPYIDX:
    DB 0
COPYSDRV:
    DB 0
COPYDDRV:
    DB 0
COPYMODE:
    DB 0
CPYSTAT:
    DB 0
CPYSRCST:
    DB 0
CPYDSTST:
    DB 0
COPYBASE:
    DW 0
COPYNAME:
    DW 0
VSTART:
    DW 0
VPREV:
    DW 0
VREC:
    DW 0
VSIZE:
    DW 0
DRAWROW:
    DB 0
ROWIDX:
    DB 0
HIT:
    DB 0
SCNROWS:
    DB 0
SCNCOUNT:
    DW 0
SCNSTART:
    DW 0
SCNSTA:
    DW 0
SCNCNT:
    DW 0
SCNROW:
    DW 0
SCNCAC:
    DW 0
SCNFCB:
    DW 0
CACHEP:
    DW 0
FCBP:
    DW 0
DSTPTR:
    DW 0
LPTR:
    DW 0
RPTR:
    DW 0
NAMEPTR:
    DW 0
NAMELEN:
    DB 0
NAMEOVER:
    DB 0
NAMECHAR:
    DB 0
RNINDEX:
    DB 0
RNBASECT:
    DB 0
RNEXTCT:
    DB 0
DOTFLAG:
    DB 0
RNPOS:
    DB 0
NAMEBUF:
    DS 12
RSMCMD:
    DS 64
RSMCLEN:
    DB 0
RSMCOVR:
    DB 0
RSMCHAR:
    DB 0
RSMKIND:
    DB 0
RSMFALL:
    DB 0
RSMFLAGS:
    DB 0
RSMDRIVE:
    DB 0
RSMFOUND:
    DB 0
RSMNIDX:
    DB 0
RSMCRCL:
    DB 0
RSMCRCH:
    DB 0
RSMEXPL:
    DB 0
RSMEXPH:
    DB 0
RSMORD:
    DW 0
RSMSTART:
    DW 0
RSMNAMEP:
    DW 0
RSMDIRP:
    DW 0
RSMPAGEP:
    DW 0
RSMSELP:
    DW 0
RSMCUSR:
    DB 0
RSMMADE:
    DB 0
RSMOPEN:
    DB 0
RSMSTAT:
    DB 0
RSMSTRP:
    DW 0
RSMTARG:
    DW 0
RSMBUFP:
    DW 0

; Offer recovery of the reserved copy temporary left by a fatal warm boot.
; All four drives are part of the current Triptych target assumption.
TSCHECK:
    LD A,1
    LD (TDRIVE),A
TSCLOOP:
    LD A,(TDRIVE)
    CP 5
    RET NC
    LD (TMPFCB),A
    LD HL,TMPFCB+12
    CALL ZERO24
    LD DE,TMPFCB
    LD C,15
    CALL 5
    CP $FF
    JR Z,TSCNEXT
    LD A,11
    LD (MSG),A
    CALL DRAW
    CALL READKEY
    CP 'd'
    JP Z,TSDEL
    CP 'D'
    JP Z,TSDEL
    XOR A
    LD (MSG),A
    CALL DRAW
    JR TSCNEXT
TSDEL:
    LD DE,TMPFCB
    LD C,19
    CALL 5
    CP $FF
    JR Z,TSER
    LD A,12
    LD (MSG),A
    JR TSDONE
TSER:
    LD A,13
    LD (MSG),A
TSDONE:
    CALL DRAW
    CALL READKEY
    XOR A
    LD (MSG),A
    CALL REFRESH
    CALL DRAW
TSCNEXT:
    LD A,(TDRIVE)
    INC A
    LD (TDRIVE),A
    JP TSCLOOP

; Ask before mutating either drive. The selected 8.3 name is copied to the
; opposite panel's drive. The source stays intact until a verified temp is
; renamed into place.
DOCOPY:
    XOR A
    LD (COPYMODE),A
    JR DOCPSEL
DOMOVE:
    LD A,1
    LD (COPYMODE),A
DOCPSEL:
    CALL SELCHECK
    JP NZ,NOSELECT
    CALL CPBUILD
    LD A,(COPYMODE)
    OR A
    JR Z,CPASK
    LD A,(COPYSDRV)
    LD B,A
    LD A,(COPYDDRV)
    CP B
    JR NZ,CPMVASK
    LD A,29
    JP CPREPORT
CPMVASK:
    LD A,23
    JR CPASKGO
CPASK:
    LD A,14
CPASKGO:
    LD (MSG),A
    CALL DRAW
    CALL READKEY
    CP 'y'
    JR Z,COPYGO
    CP 'Y'
    JP NZ,CPCANCEL

COPYGO:
    XOR A
    LD (CPYSTAT),A
    CALL CPBUILD
    LD DE,SRCFCB
    LD C,15
    CALL 5
    CP $FF
    JP Z,CPMISS
    LD DE,DESTFCB
    LD C,15
    CALL 5
    CP $FF
    JP NZ,CPEXIST
    LD DE,TMPFCB
    LD C,15
    CALL 5
    CP $FF
    JP NZ,CPTEMP
    LD HL,TMPFCB+12
    CALL ZERO24
    LD DE,TMPFCB
    LD C,22
    CALL 5
    CP $FF
    JP Z,CPMAKEER

; Sequential I/O preserves every complete CP/M record, including text EOF,
; binary control bytes, and record padding. Both FCBs advance across extents.
CPWRITE:
    LD DE,DMA
    LD C,26
    CALL 5
    LD DE,SRCFCB
    LD C,20
    CALL 5
    CP 1
    JP Z,CPWEND
    OR A
    JP NZ,CPWERR
    LD DE,TMPFCB
    LD C,21
    CALL 5
    OR A
    JP NZ,CPWERR
    JP CPWRITE

CPWERR:
    LD (CPYSTAT),A
    JP CPABORT

CPWEND:
    LD DE,TMPFCB
    LD C,16
    CALL 5
    CP $FF
    JP Z,CPCLOSEE
    LD DE,SRCFCB
    LD C,16
    CALL 5
    CP $FF
    JP Z,CPCLOSEE

; Re-open both files from record zero and compare the actual records.
    LD HL,SRCFCB+12
    CALL ZERO24
    LD HL,TMPFCB+12
    CALL ZERO24
    LD DE,SRCFCB
    LD C,15
    CALL 5
    CP $FF
    JP Z,CPOPENER
    LD DE,TMPFCB
    LD C,15
    CALL 5
    CP $FF
    JP Z,CPOPENER

CPVERIFY:
    LD DE,DMA
    LD C,26
    CALL 5
    LD DE,SRCFCB
    LD C,20
    CALL 5
    LD (CPYSRCST),A
    CP 1
    JR Z,CPVDST
    OR A
    JP NZ,CPVERERR
CPVDST:
    LD DE,VDMA
    LD C,26
    CALL 5
    LD DE,TMPFCB
    LD C,20
    CALL 5
    LD (CPYDSTST),A
    LD B,A
    LD A,(CPYSRCST)
    CP B
    JP NZ,CPMISM
    CP 1
    JP Z,CPVDONE
    OR A
    JP NZ,CPVERERR
    LD HL,DMA
    LD DE,VDMA
    LD B,128
CPCOMP:
    LD A,(HL)
    EX DE,HL
    CP (HL)
    EX DE,HL
    JP NZ,CPMISM
    INC HL
    INC DE
    DJNZ CPCOMP
    JP CPVERIFY

CPVDONE:
    LD DE,SRCFCB
    LD C,16
    CALL 5
    CP $FF
    JP Z,CPCLOSEE
    LD DE,TMPFCB
    LD C,16
    CALL 5
    CP $FF
    JP Z,CPCLOSEE
    LD HL,DESTFCB+1
    LD DE,TMPFCB+17
    LD BC,11
    LDIR
    LD DE,TMPFCB
    LD C,23
    CALL 5
    CP $FF
    JP Z,CPRENERR
    LD A,(COPYMODE)
    OR A
    JR Z,CPCOPYOK
    LD DE,SRCFCB
    LD C,19
    CALL 5
    CP $FF
    JR Z,CPMOVEDL
    LD A,24
    JP CPREPORT
CPMOVEDL:
    LD A,25
    JP CPREPORT
CPCOPYOK:
    LD A,5
    JP CPREPORT

CPMISS:
    LD A,6
    JP CPREPORT
CPEXIST:
; The OPEN was a read-only existence probe; CP/M 2.2 FCBs hold no open handle.
    LD DE,SRCFCB
    LD C,16
    CALL 5
    LD A,7
    JP CPREPORT
CPTEMP:
; As above, discard the probe FCB after reporting the reserved-name collision.
    LD DE,SRCFCB
    LD C,16
    CALL 5
    LD A,8
    JP CPREPORT
CPMAKEER:
    LD DE,SRCFCB
    LD C,16
    CALL 5
    LD A,18
    JP CPREPORT
CPCLOSEE:
    LD A,$FD
    LD (CPYSTAT),A
    JP CPABORT
CPOPENER:
    LD (CPYSTAT),A
    JP CPABORT
CPVERERR:
    LD (CPYSTAT),A
    JP CPABORT
CPMISM:
    LD A,$FE
    LD (CPYSTAT),A
    JP CPABORT
CPRENERR:
    LD A,$FC
    LD (CPYSTAT),A
    JP CPABORT

; Ordinary failures leave the source alone and try to remove the incomplete
; reserved file. Fatal BDOS media errors do not return here; CHECKTEMP offers
; cleanup after the CCP has warm-booted.
CPABORT:
    LD DE,SRCFCB
    LD C,16
    CALL 5
    LD DE,TMPFCB
    LD C,16
    CALL 5
    LD DE,TMPFCB
    LD C,19
    CALL 5
    CP $FF
    JR Z,CPCLEANE
    LD A,(CPYSTAT)
    CP 1
    JR Z,CPDIR
    CP 2
    JR Z,CPDISK
    CP $FE
    JR Z,CPVMSG
    LD A,9
    JP CPREPORT
CPDISK:
    LD A,15
    JP CPREPORT
CPDIR:
    LD A,16
    JP CPREPORT
CPVMSG:
    LD A,10
    JP CPREPORT
CPCLEANE:
    LD A,17
    JP CPREPORT

CPCANCEL:
    XOR A
    LD (MSG),A
    CALL DRAW
    JP KEYLOOP

CPREPORT:
    LD (MSG),A
    CALL REFRESH
    CALL DRAW
    CALL READKEY
    XOR A
    LD (MSG),A
    CALL REFRESH
    CALL DRAW
    JP KEYLOOP

; Return A=0 when the active panel selection names a visible file.
SELCHECK:
    LD A,(ACTIVE)
    OR A
    JR NZ,SELRIGHT
    LD A,(SELL)
    LD B,A
    LD A,(ROWL)
    CP B
    JR C,SELNONE
    JR Z,SELNONE
    XOR A
    RET
SELRIGHT:
    LD A,(SELR)
    LD B,A
    LD A,(ROWR)
    CP B
    JR C,SELNONE
    JR Z,SELNONE
    XOR A
    RET
SELNONE:
    LD A,1
    OR A
    RET

; Rename changes only the selected file's directory names on its active drive.
DORENAME:
    CALL SELCHECK
    JP NZ,NOSELECT
    CALL CPBUILD
    LD A,(COPYSDRV)
    LD (DESTFCB),A
    CALL RENINPUT
    OR A
    JP Z,CPCANCEL
    CP 2
    JP Z,RNBADNAM
    CALL RENPARSE
    OR A
    JR NZ,RNBADNAM
; Preserve the three CP/M file attributes held in the extension high bits.
    LD HL,SRCFCB+9
    LD DE,DESTFCB+9
    LD B,3
RENATTR:
    LD A,(HL)
    AND $80
    LD C,A
    LD A,(DE)
    OR C
    LD (DE),A
    INC HL
    INC DE
    DJNZ RENATTR
    CALL RENCOMP
    OR A
    JR Z,RNSAME
    LD DE,DESTFCB
    LD C,15
    CALL 5
    CP $FF
    JR NZ,RNEXIST
; BDOS rename uses the old name at +1 and the new name at +17. CPBUILD
; cleared +16, the new-drive field, because a same-drive rename uses zero.
    LD HL,DESTFCB+1
    LD DE,SRCFCB+17
    LD BC,11
    LDIR
    LD DE,SRCFCB
    LD C,23
    CALL 5
    CP $FF
    JR Z,RNFAIL
    LD A,19
    JP CPREPORT
RNBADNAM:
    LD A,20
    JP CPREPORT
RNEXIST:
    LD A,21
    JP CPREPORT
RNFAIL:
    LD A,22
    JP CPREPORT
RNSAME:
    LD A,30
    JP CPREPORT

; Collect a bounded line on the status row. Escape cancels, backspace edits,
; and an overlong line stays invalid until its stored characters are erased.
RENINPUT:
    XOR A
    LD (NAMELEN),A
    LD (NAMEOVER),A
    LD (MSG),A
    CALL DRAW
    LD DE,RENROW
    CALL PRINTS
    LD DE,RENPRM
    CALL PRINTS
RNINPUT:
    CALL READKEY
    CP 27
    JP Z,RNESC
    CP 13
    JP Z,RNENTER
    CP 8
    JP Z,RNBACK
    CP 127
    JP Z,RNBACK
; CP/M directory names are conventionally uppercase.
    CP 'a'
    JR C,RNUPPER
    CP 'z'+1
    JR NC,RNUPPER
    SUB 32
RNUPPER:
    CP 33
    JR C,RNBELL
    CP 127
    JR NC,RNBELL
    LD (NAMECHAR),A
    LD A,(NAMELEN)
    CP 12
    JP NC,RNLONG
    LD E,A
    LD D,0
    LD HL,NAMEBUF
    ADD HL,DE
    LD A,(NAMECHAR)
    LD (HL),A
    LD A,(NAMELEN)
    INC A
    LD (NAMELEN),A
    LD A,(NAMECHAR)
    CALL RENOUT
    JP RNINPUT
RNLONG:
    LD A,1
    LD (NAMEOVER),A
RNBELL:
    LD A,7
    CALL RENOUT
    JP RNINPUT
RNBACK:
    LD A,(NAMEOVER)
    OR A
    JR Z,RNBKONE
    XOR A
    LD (NAMEOVER),A
    LD (NAMELEN),A
    LD B,12
RNBKALL:
    CALL RNERASE
    DJNZ RNBKALL
    JP RNINPUT
RNBKONE:
    LD A,(NAMELEN)
    OR A
    JP Z,RNINPUT
    DEC A
    LD (NAMELEN),A
    LD E,A
    LD D,0
    LD HL,NAMEBUF
    ADD HL,DE
    LD (HL),0
    CALL RNERASE
    JP RNINPUT
RNENTER:
    LD A,(NAMEOVER)
    OR A
    JR NZ,RNBADIN
    LD A,(NAMELEN)
    OR A
    JR Z,RNBADIN
    LD A,1
    RET
RNBADIN:
    LD A,2
    RET
RNESC:
    XOR A
    RET
RNERASE:
    LD A,8
    CALL RENOUT
    LD A,' '
    CALL RENOUT
    LD A,8
    CALL RENOUT
    RET

; Function 6 output bypasses BDOS function 2's ^S/^P poll, which can consume
; the next queued ordinary key while the user is typing ahead.
RENOUT:
    LD E,A
    PUSH BC
    LD C,6
    CALL 5
    POP BC
    RET

; Parse the typed name into DESTFCB's eleven-byte name, enforcing the CP/M
; 8.3 lengths and unambiguous-name character set.
RENPARSE:
    LD HL,DESTFCB+1
    LD B,11
    LD A,' '
RNPADF:
    LD (HL),A
    INC HL
    DJNZ RNPADF
    XOR A
    LD (RNINDEX),A
    LD (RNBASECT),A
    LD (RNEXTCT),A
    LD (DOTFLAG),A
    LD (RNPOS),A
RNLOOP:
    LD A,(RNINDEX)
    LD E,A
    LD D,0
    LD HL,NAMEBUF
    ADD HL,DE
    LD A,(HL)
    CP '.'
    JR Z,RNDOT
    LD (NAMECHAR),A
    CALL RNCHAROK
    OR A
    JR NZ,RNINVLD
    LD A,(DOTFLAG)
    OR A
    JR NZ,RNEXTCHR
    LD A,(RNBASECT)
    CP 8
    JR NC,RNINVLD
    INC A
    LD (RNBASECT),A
    JR RNSTORE
RNEXTCHR:
    LD A,(RNEXTCT)
    CP 3
    JR NC,RNINVLD
    INC A
    LD (RNEXTCT),A
RNSTORE:
    LD A,(RNPOS)
    LD E,A
    LD D,0
    LD HL,DESTFCB+1
    ADD HL,DE
    LD A,(NAMECHAR)
    LD (HL),A
    LD A,(RNPOS)
    INC A
    LD (RNPOS),A
    JR RNNEXT
RNDOT:
    LD A,(DOTFLAG)
    OR A
    JR NZ,RNINVLD
    LD A,(RNBASECT)
    OR A
    JR Z,RNINVLD
    LD A,1
    LD (DOTFLAG),A
    LD A,8
    LD (RNPOS),A
RNNEXT:
    LD A,(RNINDEX)
    INC A
    LD (RNINDEX),A
    LD B,A
    LD A,(NAMELEN)
    CP B
    JR NZ,RNLOOP
    LD A,(RNBASECT)
    OR A
    JR Z,RNINVLD
    LD A,(DOTFLAG)
    OR A
    JR Z,RNPAROK
    LD A,(RNEXTCT)
    OR A
    JR Z,RNINVLD
RNPAROK:
    XOR A
    RET
RNINVLD:
    LD A,1
    OR A
    RET

RNCHAROK:
    CP 'A'
    JR C,RNCHNUM
    CP 'Z'+1
    JR C,RNCHOK
RNCHNUM:
    CP '0'
    JR C,RNCHSYM
    CP '9'+1
    JR C,RNCHOK
RNCHSYM:
    LD HL,RNCHARS
    LD B,12
RNCHLOOP:
    CP (HL)
    JR Z,RNCHOK
    INC HL
    DJNZ RNCHLOOP
    JR RNCHARNO
RNCHOK:
    XOR A
    RET
RNCHARNO:
    LD A,1
    OR A
    RET

; A=0 only if all eleven FCB name bytes already match.
RENCOMP:
    LD HL,SRCFCB+1
    LD DE,DESTFCB+1
    LD B,11
RNCMPLP:
    LD A,(HL)
    EX DE,HL
    CP (HL)
    EX DE,HL
    JR NZ,RNCMPNO
    INC HL
    INC DE
    DJNZ RNCMPLP
    XOR A
    RET
RNCMPNO:
    LD A,1
    OR A
    RET

; Delete one selected name only after an explicit confirmation.
DODELETE:
    CALL SELCHECK
    JP NZ,NOSELECT
    CALL CPBUILD
    LD A,26
    LD (MSG),A
    CALL DRAW
    CALL READKEY
    CP 'y'
    JR Z,DELETEGO
    CP 'Y'
    JP NZ,CPCANCEL
DELETEGO:
    LD DE,SRCFCB
    LD C,19
    CALL 5
    CP $FF
    JR Z,DELFAIL
    LD A,27
    JP CPREPORT
DELFAIL:
    LD A,28
    JP CPREPORT

; The editor and CCP run-command paths deliberately leave this transient and
; relaunch it. CP/M supplies no ordinary child-process return to this instance.
DOEDIT:
    CALL SELCHECK
    JP NZ,NOSELECT
    LD A,1
    LD (RSMKIND),A
    CALL RSMSTORE
    OR A
    JP NZ,RSMHFAIL
    JP RSMEDOUT
DORUN:
    CALL RSMCIN
    OR A
    JP Z,CPCANCEL
    LD A,2
    LD (RSMKIND),A
    CALL RSMSTORE
    OR A
    JP NZ,RSMHFAIL
    JP RSMCDOUT
RSMHFAIL:
    JP CPREPORT

; Collect one bounded CCP command. An overflow must be cleared in full before
; accepting another line, so Horton never offers a truncated command.
RSMCIN:
    XOR A
    LD (RSMCLEN),A
    LD (RSMCOVR),A
    LD DE,RSMCMDRW
    CALL PRINTS
    LD DE,RSMCMDLN
    CALL PRINTS
RSMCLOOP:
    CALL READKEY
    CP 27
    JP Z,RSMCANC
    CP 13
    JP Z,RSMCENDR
    CP 8
    JP Z,RSMCBACK
    CP 127
    JP Z,RSMCBACK
    CP 32
    JP C,RSMCBELL
    CP 127
    JP NC,RSMCBELL
    CP 'a'
    JP C,RSMCUPPR
    CP 'z'+1
    JP NC,RSMCUPPR
    SUB 32
RSMCUPPR:
    LD (RSMCHAR),A
    LD A,(RSMCLEN)
    CP 64
    JP NC,RSMCFULL
    LD E,A
    LD D,0
    LD HL,RSMCMD
    ADD HL,DE
    LD A,(RSMCHAR)
    LD (HL),A
    LD A,(RSMCLEN)
    INC A
    LD (RSMCLEN),A
    LD A,(RSMCHAR)
    CALL RENOUT
    JP RSMCLOOP
RSMCFULL:
    LD A,1
    LD (RSMCOVR),A
RSMCBELL:
    LD A,7
    CALL RENOUT
    JP RSMCLOOP
RSMCBACK:
    LD A,(RSMCOVR)
    OR A
    JP Z,RSMBKONE
    XOR A
    LD (RSMCOVR),A
    LD (RSMCLEN),A
    LD B,64
RSMBKALL:
    CALL RNERASE
    DJNZ RSMBKALL
    JP RSMCLOOP
RSMBKONE:
    LD A,(RSMCLEN)
    OR A
    JP Z,RSMCLOOP
    DEC A
    LD (RSMCLEN),A
    LD E,A
    LD D,0
    LD HL,RSMCMD
    ADD HL,DE
    LD (HL),0
    CALL RNERASE
    JP RSMCLOOP
RSMCENDR:
    LD A,(RSMCOVR)
    OR A
    JP NZ,RSMCBELL
    LD A,(RSMCLEN)
    OR A
    JP Z,RSMCANC
    LD A,1
    RET
RSMCANC:
    XOR A
    RET

; Show the literal CCP steps. The command is left for the user to enter at
; CCP; the transient program has no documented way to submit it itself.
RSMEDOUT:
    LD DE,RSMEDIT1
    CALL PRINTS
    LD A,(ACTIVE)
    OR A
    JP NZ,RSMEDRGT
    LD A,(VDMA+13)
    LD HL,VDMA+16
    JP RSMEDNAM
RSMEDRGT:
    LD A,(VDMA+14)
    LD HL,VDMA+27
RSMEDNAM:
    LD (NAMEPTR),HL
    ADD A,64
    CALL PUTCH
    LD A,':'
    CALL PUTCH
    LD DE,CRLF
    CALL PRINTS
    LD DE,RSMEDIT2
    CALL PRINTS
    CALL RSMCMDNM
    LD DE,RSMEDIT3
    CALL PRINTS
    CALL RSMPRDRV
    LD DE,RSMEDIT4
    CALL PRINTS
    RET
RSMCMDNM:
    LD HL,(NAMEPTR)
    LD B,8
RSMCNBAS:
    LD A,(HL)
    CP ' '
    JR Z,RSMCNEND
    CALL PUTCH
    INC HL
    DJNZ RSMCNBAS
RSMCNEND:
    LD HL,(NAMEPTR)
    LD DE,8
    ADD HL,DE
    LD A,(HL)
    CP ' '
    RET Z
    LD A,'.'
    CALL PUTCH
    LD B,3
RSMCNEXT:
    LD A,(HL)
    CP ' '
    RET Z
    CALL PUTCH
    INC HL
    DJNZ RSMCNEXT
    RET
RSMCDOUT:
    LD DE,RSMOUT1
    CALL PRINTS
    LD A,(RSMCLEN)
    LD B,A
    LD HL,RSMCMD
RSMCDLP:
    LD A,(HL)
    CALL PUTCH
    INC HL
    DJNZ RSMCDLP
    LD DE,RSMOUT2
    CALL PRINTS
    CALL RSMPRDRV
    LD DE,RSMOUT3
    CALL PRINTS
    RET 

; Print the saved default-drive command to reestablish CCP state after a
; transient's warm boot, which resumes with the drive selected at the CCP.
RSMPRDRV:
    LD A,(VDMA+11)
    ADD A,65
    CALL PUTCH
    LD A,':'
    CALL PUTCH
    LD DE,CRLF
    CALL PRINTS
    RET

; Parse only blank input or /R. This must run before REFRESH changes the DMA,
; because CP/M places the command tail at 0080h.
RSMARGS:
    LD HL,$0080
    LD A,(HL)
    LD B,A
    INC HL
RSMASKIP:
    LD A,B
    OR A
    JP Z,RSMARG0
    LD A,(HL)
    CP ' '
    JP NZ,RSMASL
    INC HL
    DEC B
    JP RSMASKIP
RSMASL:
    CP '/'
    JP NZ,RSMABAD
    INC HL
    DEC B
    LD A,B
    OR A
    JP Z,RSMABAD
    LD A,(HL)
    OR $20
    CP 'r'
    JP NZ,RSMABAD
    INC HL
    DEC B
RSMATRL:
    LD A,B
    OR A
    JP Z,RSMARG1
    LD A,(HL)
    CP ' '
    JP NZ,RSMABAD
    INC HL
    DEC B
    JP RSMATRL
RSMARG0:
    XOR A
    RET
RSMARG1:
    LD A,1
    RET
RSMABAD:
    LD A,$FF
    RET

; Save one session on B:user 0. Return A=0 or one of the user-facing MSG codes.
RSMSTORE:
    XOR A
    LD (RSMMADE),A
    LD (RSMOPEN),A
    LD C,32
    LD E,$FF
    CALL 5
    OR A
    JP Z,RSMSTUSR
    LD A,34
    RET
RSMSTUSR:
    CALL RSMBLDC
    LD C,29
    CALL 5
    BIT 1,L
    JP NZ,RSMSTRO

    LD HL,RSMFINAL
    LD A,2
    CALL RSMFCB
    CALL RSMSEAR
    CP $FF
    JP NZ,RSMSTCOL
    LD HL,RSMTEMP
    LD A,2
    CALL RSMFCB
    CALL RSMSEAR
    CP $FF
    JP NZ,RSMSTCOL

    LD HL,RSMTEMP
    LD A,2
    CALL RSMFCB
    LD DE,VFCB
    LD C,22
    CALL 5
    CP $FF
    JP Z,RSMSTIO
    LD A,1
    LD (RSMMADE),A
    LD A,1
    LD (RSMOPEN),A

    LD DE,VDMA
    LD C,26
    CALL 5
    LD DE,VFCB
    LD C,21
    CALL 5
    OR A
    JP NZ,RSMSTIO
    LD DE,VFCB
    LD C,16
    CALL 5
    CP $FF
    JP Z,RSMSTIO
    XOR A
    LD (RSMOPEN),A

    LD HL,RSMTEMP
    LD A,2
    CALL RSMFCB
    LD DE,VFCB
    LD C,15
    CALL 5
    CP $FF
    JP Z,RSMSTIO
    LD A,1
    LD (RSMOPEN),A
    LD DE,DMA
    LD C,26
    CALL 5
    LD DE,VFCB
    LD C,20
    CALL 5
    OR A
    JP NZ,RSMSTIO
    LD HL,VDMA
    LD DE,DMA
    LD BC,128
RSMSTCMP:
    LD A,(DE)
    CP (HL)
    JP NZ,RSMSTIO
    INC HL
    INC DE
    DEC BC
    LD A,B
    OR C
    JP NZ,RSMSTCMP
    LD DE,VFCB
    LD C,20
    CALL 5
    CP 1
    JP NZ,RSMSTIO
    LD DE,VFCB
    LD C,16
    CALL 5
    CP $FF
    JP Z,RSMSTIO
    XOR A
    LD (RSMOPEN),A

    LD A,2
    LD (VFCB+16),A
    LD HL,RSMFINAL
    LD DE,VFCB+17
    LD BC,11
    LDIR
    LD DE,VFCB
    LD C,23
    CALL 5
    CP $FF
    JP Z,RSMSTIO
    XOR A
    LD (RSMMADE),A
    JP RSMSTRET

RSMSTRO:
    LD A,32
    JP RSMSTRET
RSMSTCOL:
    LD A,31
    JP RSMSTRET
RSMSTIO:
    LD A,33
    LD (RSMSTAT),A
    LD A,(RSMOPEN)
    OR A
    JP Z,RSMSTCLN
    LD DE,VFCB
    LD C,16
    CALL 5
    XOR A
    LD (RSMOPEN),A
RSMSTCLN:
    LD A,(RSMMADE)
    OR A
    JP Z,RSMSTIOE
    LD HL,RSMTEMP
    LD A,2
    CALL RSMFCB
    LD DE,VFCB
    LD C,19
    CALL 5
    XOR A
    LD (RSMMADE),A
RSMSTIOE:
    LD A,(RSMSTAT)
RSMSTRET:
    RET

; Build the canonical 128-byte record into VDMA and calculate its checksum.
RSMBLDC:
    LD HL,VDMA
    LD B,128
    XOR A
RSMBCLR:
    LD (HL),A
    INC HL
    DJNZ RSMBCLR
    LD HL,RSMMAGIC
    LD DE,VDMA
    LD BC,8
    LDIR
    LD A,1
    LD (VDMA+8),A
    LD A,128
    LD (VDMA+9),A
    LD A,(ACTIVE)
    LD (VDMA+10),A
    LD C,25
    CALL 5
    LD (VDMA+11),A
    XOR A
    LD (VDMA+12),A
    LD A,(FCBL)
    LD (VDMA+13),A
    LD A,(FCBR)
    LD (VDMA+14),A
    XOR A
    LD (VDMA+15),A
    LD A,(SELL)
    LD B,A
    LD A,(ROWL)
    CP B
    JP C,RSMBCRGT
    JP Z,RSMBCRGT
    LD A,(VDMA+15)
    OR 1
    LD (VDMA+15),A
    LD HL,CACHEL
    LD A,(SELL)
    LD DE,VDMA+16
    CALL RSMCPNAM
RSMBCRGT:
    LD A,(SELR)
    LD B,A
    LD A,(ROWR)
    CP B
    JP C,RSMBCEND
    JP Z,RSMBCEND
    LD A,(VDMA+15)
    OR 2
    LD (VDMA+15),A
    LD HL,CACHER
    LD A,(SELR)
    LD DE,VDMA+27
    CALL RSMCPNAM
RSMBCEND:
    LD A,(RSMKIND)
    LD (VDMA+38),A
    LD HL,VDMA
    CALL RSMCRC
    LD A,(RSMCRCL)
    LD (VDMA+126),A
    LD A,(RSMCRCH)
    LD (VDMA+127),A
    RET

; Copy one cached 11-byte name to DE, stripping CP/M attribute bits.
RSMCPNAM:
    EX DE,HL
    LD (RSMNAMEP),HL
    EX DE,HL
    LD B,A
    OR A
    JP Z,RSMCNCOP
    LD DE,11
RSMCNOFF:
    ADD HL,DE
    DJNZ RSMCNOFF
RSMCNCOP:
    LD DE,(RSMNAMEP)
    LD B,11
RSMCNLP:
    LD A,(HL)
    AND $7F
    LD (DE),A
    INC HL
    INC DE
    DJNZ RSMCNLP
    RET

; Set VFCB to an explicit-drive 8.3 name in HL.
RSMFCB:
    LD (RSMSTRP),HL
    LD (RSMDRIVE),A
    LD HL,VFCB
    LD B,36
    XOR A
RSMFCBC:
    LD (HL),A
    INC HL
    DJNZ RSMFCBC
    LD A,(RSMDRIVE)
    LD (VFCB),A
    LD HL,(RSMSTRP)
    LD DE,VFCB+1
    LD BC,11
    LDIR
    RET

RSMSEAR:
    LD DE,DMA
    LD C,26
    CALL 5
    LD DE,VFCB
    LD C,17
    CALL 5
    LD (HIT),A
    RET

; Calculate CRC-16/CCITT-FALSE over the first 126 bytes at HL.
RSMCRC:
    LD (RSMBUFP),HL
    LD HL,$FFFF
    LD (RSMCRCL),HL
    LD B,126
RSMCBYTE:
    LD HL,(RSMBUFP)
    LD A,(HL)
    INC HL
    LD (RSMBUFP),HL
    LD HL,RSMCRCH
    XOR (HL)
    LD (HL),A
    LD C,8
RSMCBIT:
    LD HL,(RSMCRCL)
    ADD HL,HL
    LD (RSMCRCL),HL
    JP NC,RSMCRCNX
    LD A,(RSMCRCL)
    XOR $21
    LD (RSMCRCL),A
    LD A,(RSMCRCH)
    XOR $10
    LD (RSMCRCH),A
RSMCRCNX:
    DEC C
    JP NZ,RSMCBIT
    DJNZ RSMCBYTE
    RET

; Read and validate one saved record, confirm it, consume it, then restore.
; Carry means the caller must return to the CCP without opening the panels.
RSMRES:
    LD C,32
    LD E,$FF
    CALL 5
    OR A
    JP Z,RSMRZERO
    LD DE,RSMUSRMG
    CALL PRINTS
    SCF
    RET
RSMRZERO:
    LD HL,RSMFINAL
    LD A,2
    CALL RSMFCB
    CALL RSMSEAR
    CP $FF
    JP NZ,RSMRFND
    LD DE,RSMNOFIL
    CALL PRINTS
    SCF
    RET
RSMRFND:
    LD HL,RSMTEMP
    LD A,2
    CALL RSMFCB
    CALL RSMSEAR
    CP $FF
    JP Z,RSMROPEN
    LD DE,RSMTMPFL
    CALL PRINTS
    SCF
    RET
RSMROPEN:
    LD HL,RSMFINAL
    LD A,2
    CALL RSMFCB
    LD DE,VFCB
    LD C,15
    CALL 5
    CP $FF
    JP NZ,RSMRPOK
    LD DE,RSMRERR
    CALL PRINTS
    SCF
    RET
RSMRPOK:
    LD A,1
    LD (RSMOPEN),A
    ; Sequential EOF can hide later extents after a partial first extent.
    ; Function 35 reports the full logical record count across the file.
    LD DE,VFCB
    LD C,35
    CALL 5
    LD A,(VFCB+33)
    CP 1
    JP NZ,RSMRLEN
    LD A,(VFCB+34)
    OR A
    JP NZ,RSMRLEN
    LD A,(VFCB+35)
    OR A
    JP NZ,RSMRLEN
    XOR A
    LD (VFCB+33),A
    LD (VFCB+34),A
    LD (VFCB+35),A
    LD DE,VDMA
    LD C,26
    CALL 5
    LD DE,VFCB
    LD C,20
    CALL 5
    OR A
    JP NZ,RSMRFAIL
    LD DE,DMA
    LD C,26
    CALL 5
    LD DE,VFCB
    LD C,20
    CALL 5
    CP 1
    JP NZ,RSMRFAIL
    LD DE,VFCB
    LD C,16
    CALL 5
    CP $FF
    JP Z,RSMRCLOS
    XOR A
    LD (RSMOPEN),A
    LD HL,VDMA
    CALL RSMVAL
    OR A
    JP Z,RSMRVAL
    LD DE,RSMBADFL
    CALL PRINTS
    SCF
    RET
RSMRFAIL:
    LD A,(RSMOPEN)
    OR A
    JP Z,RSMRCLOS
    LD DE,VFCB
    LD C,16
    CALL 5
    XOR A
    LD (RSMOPEN),A
    JR RSMRCLOS
RSMRLEN:
    LD DE,VFCB
    LD C,16
    CALL 5
    XOR A
    LD (RSMOPEN),A
    LD DE,RSMBADFL
    CALL PRINTS
    SCF
    RET
RSMRCLOS:
    LD DE,RSMRERR
    CALL PRINTS
    SCF
    RET

RSMRVAL:
    CALL RSMPSUM
    LD DE,RSMCNFRM
    CALL PRINTS
    CALL READKEY
    CP 'y'
    JP Z,RSMRCONF
    CP 'Y'
    JP Z,RSMRCONF
    LD DE,RSMCAN
    CALL PRINTS
    SCF
    RET
RSMRCONF:
    LD C,29
    CALL 5
    BIT 1,L
    JP NZ,RSMRROLY
    LD HL,RSMFINAL
    LD A,2
    CALL RSMFCB
    CALL RSMSEAR
    CP $FF
    JP Z,RSMRDERR
    LD A,(HIT)
    ADD A,A
    ADD A,A
    ADD A,A
    ADD A,A
    ADD A,A
    LD E,A
    LD D,0
    LD HL,DMA
    ADD HL,DE
    LD DE,9
    ADD HL,DE
    LD A,(HL)
    AND $80
    JP NZ,RSMRROLY
    LD DE,VFCB
    LD C,19
    CALL 5
    CP $FF
    JP Z,RSMRDERR
    LD A,(VDMA+10)
    LD (ACTIVE),A
    LD A,(VDMA+13)
    LD (FCBL),A
    LD A,(VDMA+14)
    LD (FCBR),A
    LD HL,0
    LD (PAGEL),HL
    LD (PAGER),HL
    XOR A
    LD (SELL),A
    LD (SELR),A
    LD (RSMFALL),A
    LD A,(VDMA+12)
    LD E,A
    LD C,32
    CALL 5
    LD A,(VDMA+11)
    LD E,A
    LD C,14
    CALL 5
    CALL RSMLOCL
    CALL RSMLOCR
    OR A
    RET
RSMRROLY:
    LD DE,RSMDLRO
    CALL PRINTS
    SCF
    RET
RSMRDERR:
    LD DE,RSMDERR
    CALL PRINTS
    SCF
    RET

RSMVAL:
    LD A,'H'
    CP (HL)
    JP NZ,RSMVFAIL
    INC HL
    LD A,'O'
    CP (HL)
    JP NZ,RSMVFAIL
    INC HL
    LD A,'R'
    CP (HL)
    JP NZ,RSMVFAIL
    INC HL
    LD A,'T'
    CP (HL)
    JP NZ,RSMVFAIL
    INC HL
    LD A,'O'
    CP (HL)
    JP NZ,RSMVFAIL
    INC HL
    LD A,'N'
    CP (HL)
    JP NZ,RSMVFAIL
    INC HL
    LD A,'R'
    CP (HL)
    JP NZ,RSMVFAIL
    INC HL
    LD A,'S'
    CP (HL)
    JP NZ,RSMVFAIL
    LD A,(VDMA+8)
    CP 1
    JP NZ,RSMVFAIL
    LD A,(VDMA+9)
    CP 128
    JP NZ,RSMVFAIL
    LD A,(VDMA+10)
    CP 2
    JP NC,RSMVFAIL
    LD A,(VDMA+11)
    CP 4
    JP NC,RSMVFAIL
    LD A,(VDMA+12)
    OR A
    JP NZ,RSMVFAIL
    LD A,(VDMA+13)
    CP 1
    JP C,RSMVFAIL
    CP 5
    JP NC,RSMVFAIL
    LD A,(VDMA+14)
    CP 1
    JP C,RSMVFAIL
    CP 5
    JP NC,RSMVFAIL
    LD A,(VDMA+15)
    AND $FC
    JP NZ,RSMVFAIL
    LD A,(VDMA+38)
    CP 1
    JP Z,RSMVKIND
    CP 2
    JP NZ,RSMVFAIL
RSMVKIND:
    LD HL,VDMA+39
    LD B,87
RSMVZERO:
    LD A,(HL)
    OR A
    JP NZ,RSMVFAIL
    INC HL
    DJNZ RSMVZERO
    LD A,(VDMA+15)
    BIT 0,A
    JP Z,RSMVNLFT
    LD HL,VDMA+16
    CALL RSMVNAME
    OR A
    JP NZ,RSMVFAIL
    JP RSMVNRGT
RSMVNLFT:
    LD HL,VDMA+16
    LD B,11
    CALL RSMZERO
    OR A
    JP NZ,RSMVFAIL
RSMVNRGT:
    LD A,(VDMA+15)
    BIT 1,A
    JP Z,RSMVNORT
    LD HL,VDMA+27
    CALL RSMVNAME
    OR A
    JP NZ,RSMVFAIL
    JP RSMVCRC
RSMVNORT:
    LD HL,VDMA+27
    LD B,11
    CALL RSMZERO
    OR A
    JP NZ,RSMVFAIL
RSMVCRC:
    LD HL,VDMA
    CALL RSMCRC
    LD A,(VDMA+126)
    LD HL,RSMCRCL
    CP (HL)
    JP NZ,RSMVFAIL
    LD A,(VDMA+127)
    INC HL
    CP (HL)
    JP NZ,RSMVFAIL
    XOR A
    RET
RSMVFAIL:
    LD A,1
    OR A
    RET

; Validate one canonical 8.3 field, with right padding and safe FCB chars.
RSMVNAME:
    LD A,(HL)
    CP ' '
    JP Z,RSMNFAIL
    LD B,8
    CALL RSMNPART
    OR A
    RET NZ
    LD B,3
    CALL RSMNPART
    RET
RSMNFAIL:
    LD A,1
    OR A
    RET
RSMNPART:
    LD C,0
RSMNLOOP:
    LD A,(HL)
    CP ' '
    JP NZ,RSMNCHAR
    LD C,1
    INC HL
    DJNZ RSMNLOOP
    XOR A
    RET
RSMNCHAR:
    LD A,C
    OR A
    JP NZ,RSMNFAIL
    LD A,(HL)
    CP '!'
    JP C,RSMNFAIL
    CP $7F
    JP NC,RSMNFAIL
    CP '*'
    JP Z,RSMNFAIL
    CP '?'
    JP Z,RSMNFAIL
    CP '.'
    JP Z,RSMNFAIL
    CP ':'
    JP Z,RSMNFAIL
    CP ';'
    JP Z,RSMNFAIL
    CP '/'
    JP Z,RSMNFAIL
    INC HL
    DJNZ RSMNLOOP
    XOR A
    RET

RSMZERO:
    LD A,(HL)
    OR A
    JP NZ,RSMZFAIL
    INC HL
    DJNZ RSMZERO
    XOR A
    RET
RSMZFAIL:
    LD A,1
    OR A
    RET

; Locate a saved name by scanning first extents, then derive page and row.
RSMLOCL:
    LD A,(VDMA+15)
    BIT 0,A
    RET Z
    LD A,(VDMA+13)
    LD HL,VDMA+16
    LD DE,PAGEL
    LD BC,SELL
    JP RSMLOC
RSMLOCR:
    LD A,(VDMA+15)
    BIT 1,A
    RET Z
    LD A,(VDMA+14)
    LD HL,VDMA+27
    LD DE,PAGER
    LD BC,SELR
RSMLOC:
    LD (RSMDRIVE),A
    LD (RSMTARG),HL
    EX DE,HL
    LD (RSMPAGEP),HL
    LD H,B
    LD L,C
    LD (RSMSELP),HL
    LD HL,RSMWILD
    LD A,(RSMDRIVE)
    CALL RSMFCB
    LD HL,0
    LD (RSMORD),HL
    LD DE,DMA
    LD C,26
    CALL 5
    LD DE,VFCB
    LD C,17
    CALL 5
    LD (HIT),A
    CP $FF
    JP Z,RSMLOST
RSMLOOP:
    CALL ENTRYADR
    LD A,(HL)
    LD C,A
    LD A,(VDMA+12)
    CP C
    JP NZ,RSMNEXT
    LD DE,12
    ADD HL,DE
    LD A,(HL)
    OR A
    JP NZ,RSMNEXT
    CALL ENTRYADR
    INC HL
    LD DE,(RSMTARG)
    LD B,11
RSMNCMP:
    LD A,(HL)
    AND $7F
    LD C,A
    LD A,(DE)
    CP C
    JP NZ,RSMNOTNM
    INC HL
    INC DE
    DJNZ RSMNCMP
    CALL RSMLOSET
    XOR A
    RET
RSMNOTNM:
    LD HL,(RSMORD)
    INC HL
    LD (RSMORD),HL
RSMNEXT:
    LD C,18
    CALL 5
    LD (HIT),A
    CP $FF
    JP NZ,RSMLOOP
RSMLOST:
    LD HL,(RSMPAGEP)
    LD (HL),0
    INC HL
    LD (HL),0
    LD HL,(RSMSELP)
    LD (HL),0
    LD A,1
    LD (RSMFALL),A
    LD A,1
    OR A
    RET
RSMLOSET:
    LD HL,0
    LD (RSMSTART),HL
RSMLOCLP:
    LD HL,(RSMORD)
    LD A,H
    OR A
    JP NZ,RSMLOSUB
    LD A,L
    CP 18
    JP C,RSMLOCFN
RSMLOSUB:
    LD HL,(RSMORD)
    LD DE,18
    OR A
    SBC HL,DE
    LD (RSMORD),HL
    LD HL,(RSMSTART)
    LD DE,18
    ADD HL,DE
    LD (RSMSTART),HL
    JP RSMLOCLP
RSMLOCFN:
    LD HL,(RSMSTART)
    LD DE,(RSMPAGEP)
    EX DE,HL
    LD (HL),E
    INC HL
    LD (HL),D
    LD HL,(RSMSELP)
    LD A,(RSMORD)
    LD (HL),A
    RET

RSMPSUM:
    LD DE,RSMSUMM
    CALL PRINTS
    LD DE,RSMLEFT
    CALL PRINTS
    LD A,(VDMA+13)
    ADD A,64
    CALL PUTCH
    LD A,':'
    CALL PUTCH
    LD DE,CRLF
    CALL PRINTS
    LD A,(VDMA+15)
    BIT 0,A
    JP Z,RSMPSLN
    LD DE,RSMSELM
    CALL PRINTS
    LD HL,VDMA+16
    JP RSMPSLNM
RSMPSLN:
    LD DE,RSMNOSEL
    CALL PRINTS
    JP RSMPSLE
RSMPSLNM:
    LD (NAMEPTR),HL
    CALL RSMCMDNM
RSMPSLE:
    LD DE,CRLF
    CALL PRINTS
    LD DE,RSMRIGHT
    CALL PRINTS
    LD A,(VDMA+14)
    ADD A,64
    CALL PUTCH
    LD A,':'
    CALL PUTCH
    LD DE,CRLF
    CALL PRINTS
    LD A,(VDMA+15)
    BIT 1,A
    JP Z,RSMPSRN
    LD DE,RSMSELM
    CALL PRINTS
    LD HL,VDMA+27
    JP RSMPSRNM
RSMPSRN:
    LD DE,RSMNOSEL
    CALL PRINTS
    JP RSMPSRE
RSMPSRNM:
    LD (NAMEPTR),HL
    CALL RSMCMDNM
RSMPSRE:
    LD DE,CRLF
    CALL PRINTS
    LD DE,RSMDEFLT
    CALL PRINTS
    LD A,(VDMA+11)
    ADD A,65
    CALL PUTCH
    LD DE,CRLF
    CALL PRINTS
    RET

; Build clean read/write FCBs for the highlighted cache entry and target drive.
CPBUILD:
    LD A,(ACTIVE)
    OR A
    JR NZ,CPFROMR
    LD A,(SELL)
    LD (COPYIDX),A
    LD HL,CACHEL
    LD (COPYBASE),HL
    LD A,(FCBL)
    LD (COPYSDRV),A
    LD A,(FCBR)
    LD (COPYDDRV),A
    JR CPINDEX
CPFROMR:
    LD A,(SELR)
    LD (COPYIDX),A
    LD HL,CACHER
    LD (COPYBASE),HL
    LD A,(FCBR)
    LD (COPYSDRV),A
    LD A,(FCBL)
    LD (COPYDDRV),A
CPINDEX:
    LD HL,(COPYBASE)
    LD A,(COPYIDX)
    OR A
    JR Z,CPNAMEST
    LD B,A
    LD DE,11
CPIDXLP:
    ADD HL,DE
    DJNZ CPIDXLP
CPNAMEST:
    LD (COPYNAME),HL
    LD A,(COPYSDRV)
    LD (SRCFCB),A
    LD A,(COPYDDRV)
    LD (DESTFCB),A
    LD (TMPFCB),A
    LD HL,(COPYNAME)
    LD DE,SRCFCB+1
    LD BC,11
    LDIR
    LD HL,(COPYNAME)
    LD DE,DESTFCB+1
    LD BC,11
    LDIR
    LD HL,TMPNAME
    LD DE,TMPFCB+1
    LD BC,11
    LDIR
    LD HL,SRCFCB+12
    CALL ZERO24
    LD HL,DESTFCB+12
    CALL ZERO24
    LD HL,TMPFCB+12
    CALL ZERO24
    RET

; Clear the twenty-four FCB bytes following drive and filename.
ZERO24:
    LD B,24
    XOR A
Z24LOOP:
    LD (HL),A
    INC HL
    DJNZ Z24LOOP
    RET
