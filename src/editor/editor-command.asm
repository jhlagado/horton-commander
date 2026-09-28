; Command-tail parser for EDIT and EDIT NAME.EXT.

; EditorCommandLength
COMLEN EQU $0080
; EditorCommandStart
COMSTA  EQU $0081

; EditorCommandCodeStart
COMCODST:
;@ROUTINE out A,carry,zero clobbers sign,parity,halfCarry,BC,DE,HL,IX
; EditorPrepareCommand
PRECOM:
            LD   HL,DEFNAM
            LD   DE,FCB
            CALL BUILDFCB
            LD   (SAVSTA),A
            LD   A,(COMLEN)
            LD   B,A
            LD   HL,COMSTA
            CALL COMSKISP
            JR   Z,COMREA
            LD   (SAVSTA),A
            PUSH HL
            LD   C,B
            PUSH BC
            XOR  A
            LD   (FCB),A
            LD   HL,FCB+1
            LD   DE,FCB+2
            LD   BC,10
            LD   (HL),' '
            LDIR
            POP  BC
            POP  HL
            CALL COMPARNA
            JR   C,COMINV
            CALL COMSKISP
            JR   NZ,COMINV
; EditorCommandReady
COMREA:
            LD   HL,FCB+9
            LD   DE,BACEXT
            CALL COMEXTEQ
            JR   Z,COMINV
            LD   HL,FCB+9
            LD   DE,TEMEXT
            CALL COMEXTEQ
            JR   Z,COMINV
            XOR  A
            RET
; EditorCommandInvalid
COMINV:
            LD   A,ERRCOM
            SCF
            RET

;@ROUTINE in B,HL out A,B,HL,zero clobbers carry,sign,parity,halfCarry
; EditorCommandSkipSpaces
COMSKISP:
            LD   A,B
            OR   A
            RET  Z
            LD   A,(HL)
            CP   ' '
            RET  NZ
            INC  HL
            DEC  B
            JR   COMSKISP

;@ROUTINE in B,HL out A,B,HL,carry,zero clobbers sign,parity,halfCarry,C,D,IX
; EditorCommandParseName
COMPARNA:
            LD   IX,FCB+1
            LD   D,8
            LD   C,0
; EditorCommandNameByte
COMNAMBY:
            LD   A,B
            OR   A
            JR   Z,COMNAMDO
            LD   A,(HL)
            CP   ' '
            JR   Z,COMNAMDO
            CP   '.'
            JR   NZ,COMNAMDA
            LD   A,D
            CP   8
            JR   NZ,COMNAMBA
            LD   A,C
            OR   A
            JR   Z,COMNAMBA
            LD   IX,FCB+9
            LD   D,3
            LD   C,0
            JR   COMNAMTA
; EditorCommandNameData
COMNAMDA:
            CP   'a'
            JR   C,COMNAMCH
            CP   'z'+1
            JR   NC,COMNAMCH
            AND  $DF
; EditorCommandNameCheck
COMNAMCH:
            CP   '!'
            JR   C,COMNAMBA
            CP   $7F
            JR   NC,COMNAMBA
            CP   '*'
            JR   C,COMFILHI
            CP   '-'
            JR   C,COMNAMBA
            CP   '/'
            JR   Z,COMNAMBA
            CP   ':'
            JR   C,COMFILHI
            CP   '@'
            JR   C,COMNAMBA
; EditorCommandFilenameHigh
COMFILHI:
            CP   '['
            JR   C,COMFILRE
            CP   '^'
            JR   C,COMNAMBA
            CP   '_'
            JR   Z,COMNAMBA
; EditorCommandFilenameReady
COMFILRE:
            OR   A
            INC  C
            PUSH AF
            LD   A,D
            CP   C
            JR   C,COMNAMOV
            POP  AF
            LD   (IX+0),A
            INC  IX
; EditorCommandNameTake
COMNAMTA:
            INC  HL
            DEC  B
            JR   COMNAMBY
; EditorCommandNameDone
COMNAMDO:
            LD   A,C
            OR   A
            JR   Z,COMNAMBA
            RET
; EditorCommandNameOverflow
COMNAMOV:
            POP  AF
; EditorCommandNameBad
COMNAMBA:
            SCF
            RET

;@ROUTINE in DE,HL out A,zero clobbers carry,sign,parity,halfCarry,B,DE,HL
; EditorCommandExtensionEqual
COMEXTEQ:
            LD   B,3
; EditorCommandExtensionLoop
COMEXTLO:
            LD   A,(DE)
            CP   (HL)
            RET  NZ
            INC  DE
            INC  HL
            DJNZ COMEXTLO
            XOR  A
            RET
; EditorCommandCodeEnd
COMCODEN:
