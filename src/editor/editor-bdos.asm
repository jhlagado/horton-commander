; CP/M BDOS and FCB helpers. IX and IY are not standardized by CP/M, so the
; wrapper preserves both around every guest operating-system call.

CpmBdos EQU $0005

; EditorBdosCodeStart
BDOCODST:
;@ROUTINE in C,DE out A,carry,zero clobbers sign,parity,halfCarry,BC,DE,HL
; EditorCallBdos
CALLBDOS:
            PUSH IX
            PUSH IY
            CALL CpmBdos
            POP  IY
            POP  IX
            RET

;@ROUTINE in DE,HL out A,HL,carry,zero clobbers sign,parity,halfCarry,BC,DE
; EditorBuildFcb
BUILDFCB:
            LD   BC,12
            LDIR
            XOR  A
            LD   B,24
; EditorClearFcbTail
CLEFCBTA:
            LD   (DE),A
            INC  DE
            DJNZ CLEFCBTA
            RET

;@ROUTINE in DE out A clobbers carry,zero,sign,parity,halfCarry,BC,DE,HL
; EditorSetDma
SETDMA:
            LD   C,26
            JR   CALLBDOS

;@ROUTINE in C out A clobbers carry,zero,sign,parity,halfCarry,BC,DE,HL
; EditorTransactionCall
TRACAL:
            LD   DE,TRAFCB
            JR   CALLBDOS

;@ROUTINE in C out A clobbers carry,zero,sign,parity,halfCarry,BC,DE,HL
; EditorSelectedCall
SELCAL:
            LD   DE,FCB
            JR   CALLBDOS
; EditorBdosCodeEnd
BDOCODEN:
