#!/usr/bin/env python3
"""
WebTransistor WS-16: 16-Bit RISC Computer Netlist Compiler (28,000+ Raw MOSFETs)
================================================================================
Synthesizes a complete 16-bit RISC microprocessor computer architecture strictly
from raw physical NMOS and PMOS transistors (zero prebuilt logic gates, zero ICs)
for the PureSilicon / WebTransistor switch-level simulator.

Subsystems synthesized:
  1. Static CMOS Standard Cell Library (NOT, NAND2/3/4, NOR2/3/4, AND2, OR2,
     XOR2, MUX2_1, 28T FULL_ADDER, 10T Zero-Contention CMOS SRAM/Latch Cell,
     Master-Slave Edge-Triggered D Flip-Flop).
  2. 16-Bit ALU (~5,000T): Ripple-Carry Adder/Subtractor (2's complement),
     Bitwise AND/OR/XOR/NOT, 1-bit & 4-bit Barrel Shifter, Z/C/N/V Flags.
  3. Register File & Special Registers (~8,500T): 16 x 16-bit R0-R15 (dual
     read port + single write port), PC, IR, SP.
  4. Control Unit & Instruction Decoder (~2,500T): Fetch-Decode-Execute FSM,
     4-to-16 Opcode Decoder for 16-instruction ISA (NOP, LDI, ADD, SUB, AND,
     OR, XOR, SHL, SHR, LOAD, STORE, JMP, JZ, JNZ, OUT_LCD, HALT).
  5. Integrated 64 x 16-Bit (1,024-bit) Static CMOS SRAM + Hardwired 32 x 16-Bit
     Program ROM (~15,000T).
  6. Memory-Mapped I/O (MMIO) 8x8 LCD Framebuffer Driver, User Switch Panel,
     Status LEDs, and On-Chip Divided CMOS Ring-Oscillator Clock (~2,000T).

Output:
  public/projects/26-16bit-risc-computer-30k.json
"""

from __future__ import annotations

import json
import math
import os
import sys
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Sequence, Tuple


# =============================================================================
# 1. Core Netlist & Grid-Aligned Silicon Floorplan Builder
# =============================================================================

GRID = 20
PITCH_X = 60  # 40px transistor width + 20px channel spacing (multiple of 20)
PITCH_Y = 60  # 40px transistor height + 20px channel spacing (multiple of 20)


@dataclass
class BlockCursor:
    """Places transistors on a non-overlapping 60x60px grid inside a macro block."""
    name: str
    origin_x: int
    origin_y: int
    cols: int
    index: int = 0
    nmos_count: int = 0
    pmos_count: int = 0

    def next_pos(self) -> Tuple[int, int]:
        col = self.index % self.cols
        row = self.index // self.cols
        self.index += 1
        x = self.origin_x + col * PITCH_X
        y = self.origin_y + row * PITCH_Y
        assert x % GRID == 0 and y % GRID == 0
        return x, y


class NetlistBuilder:
    """Hierarchical pure-MOSFET netlist compiler with automatic grid layout and ERC."""

    def __init__(self, circuit_name: str):
        self.circuit_name = circuit_name
        self.components: List[dict] = []
        self.comp_by_id: Dict[str, dict] = {}
        self.nets: Dict[str, List[Tuple[str, str]]] = {}
        self.driven_nets: set[str] = set()
        self.rail_vcc_nets: set[str] = set()
        self.rail_gnd_nets: set[str] = set()
        self._id_seq = 0
        self._net_seq = 0
        self.blocks: Dict[str, BlockCursor] = {}
        self.active_block: Optional[BlockCursor] = None

        # Global rails (one VCC and one GND per major block for clean fanout)
        self.vcc_net = "NET_VDD"
        self.gnd_net = "NET_VSS"
        self.rail_vcc_nets.add(self.vcc_net)
        self.rail_gnd_nets.add(self.gnd_net)
        self.driven_nets.add(self.vcc_net)
        self.driven_nets.add(self.gnd_net)

        # Place primary VCC and GND components at top-left power pad
        vcc_id = self.add_component("VCC", 40, 40, label="VDD")
        gnd_id = self.add_component("GND", 120, 40, label="VSS")
        self.connect(self.vcc_net, vcc_id, "OUT")
        self.connect(self.gnd_net, gnd_id, "OUT")

    def define_block(self, name: str, origin_x: int, origin_y: int, cols: int) -> BlockCursor:
        assert origin_x % GRID == 0 and origin_y % GRID == 0
        blk = BlockCursor(name=name, origin_x=origin_x, origin_y=origin_y, cols=cols)
        self.blocks[name] = blk
        self.active_block = blk
        return blk

    def set_block(self, name: str) -> BlockCursor:
        self.active_block = self.blocks[name]
        return self.active_block

    def new_net(self, prefix: str = "n") -> str:
        self._net_seq += 1
        return f"{prefix}_{self._net_seq}"

    def _next_id(self, prefix: str) -> str:
        self._id_seq += 1
        return f"{prefix}{self._id_seq}"

    def add_component(
        self,
        comp_type: str,
        x: int,
        y: int,
        comp_id: Optional[str] = None,
        rotation: int = 0,
        **props,
    ) -> str:
        assert x % GRID == 0 and y % GRID == 0, f"Off-grid ({x}, {y})"
        cid = comp_id or self._next_id(comp_type[0].lower())
        clean_props = {k: v for k, v in props.items() if v is not None}
        comp = {
            "id": cid,
            "type": comp_type,
            "x": x,
            "y": y,
            "rotation": rotation,
            "props": clean_props,
        }
        self.components.append(comp)
        self.comp_by_id[cid] = comp
        return cid

    def connect(self, net: str, comp_id: str, pin_id: str) -> None:
        if net not in self.nets:
            self.nets[net] = []
        self.nets[net].append((comp_id, pin_id))

    def mark_driven(self, net: str) -> None:
        self.driven_nets.add(net)

    def add_nmos(self, gate: str, drain: str, source: str) -> str:
        assert self.active_block is not None
        x, y = self.active_block.next_pos()
        self.active_block.nmos_count += 1
        cid = self.add_component("NMOS", x, y)
        self.connect(gate, cid, "G")
        self.connect(drain, cid, "D")
        self.connect(source, cid, "S")
        return cid

    def add_pmos(self, gate: str, source: str, drain: str) -> str:
        assert self.active_block is not None
        x, y = self.active_block.next_pos()
        self.active_block.pmos_count += 1
        cid = self.add_component("PMOS", x, y)
        self.connect(gate, cid, "G")
        self.connect(source, cid, "S")
        self.connect(drain, cid, "D")
        return cid

    def add_pull_down(self, net: str) -> str:
        assert self.active_block is not None
        x, y = self.active_block.next_pos()
        cid = self.add_component("PULL_DOWN", x, y)
        self.connect(net, cid, "OUT")
        self.mark_driven(net)
        return cid

    # =========================================================================
    # 2. Pure Static CMOS Standard Cell Library
    # =========================================================================

    def NOT(self, a: str, out: Optional[str] = None) -> str:
        """2T CMOS Inverter."""
        y = out or self.new_net("inv")
        self.add_pmos(a, self.vcc_net, y)
        self.add_nmos(a, y, self.gnd_net)
        self.mark_driven(y)
        return y

    def BUF(self, a: str, out: Optional[str] = None) -> str:
        """4T CMOS Non-Inverting Buffer."""
        mid = self.NOT(a)
        return self.NOT(mid, out)

    def NAND2(self, a: str, b: str, out: Optional[str] = None) -> str:
        """4T CMOS 2-Input NAND."""
        y = out or self.new_net("nand2")
        mid = self.new_net("n2m")
        self.add_pmos(a, self.vcc_net, y)
        self.add_pmos(b, self.vcc_net, y)
        self.add_nmos(a, y, mid)
        self.add_nmos(b, mid, self.gnd_net)
        self.mark_driven(y)
        self.mark_driven(mid)
        return y

    def NOR2(self, a: str, b: str, out: Optional[str] = None) -> str:
        """4T CMOS 2-Input NOR."""
        y = out or self.new_net("nor2")
        mid = self.new_net("p2m")
        self.add_pmos(a, self.vcc_net, mid)
        self.add_pmos(b, mid, y)
        self.add_nmos(a, y, self.gnd_net)
        self.add_nmos(b, y, self.gnd_net)
        self.mark_driven(y)
        self.mark_driven(mid)
        return y

    def NAND3(self, a: str, b: str, c: str, out: Optional[str] = None) -> str:
        """6T CMOS 3-Input NAND."""
        y = out or self.new_net("nand3")
        m1 = self.new_net("n3m1")
        m2 = self.new_net("n3m2")
        self.add_pmos(a, self.vcc_net, y)
        self.add_pmos(b, self.vcc_net, y)
        self.add_pmos(c, self.vcc_net, y)
        self.add_nmos(a, y, m1)
        self.add_nmos(b, m1, m2)
        self.add_nmos(c, m2, self.gnd_net)
        self.mark_driven(y)
        return y

    def NOR3(self, a: str, b: str, c: str, out: Optional[str] = None) -> str:
        """6T CMOS 3-Input NOR."""
        y = out or self.new_net("nor3")
        m1 = self.new_net("p3m1")
        m2 = self.new_net("p3m2")
        self.add_pmos(a, self.vcc_net, m1)
        self.add_pmos(b, m1, m2)
        self.add_pmos(c, m2, y)
        self.add_nmos(a, y, self.gnd_net)
        self.add_nmos(b, y, self.gnd_net)
        self.add_nmos(c, y, self.gnd_net)
        self.mark_driven(y)
        return y

    def NAND4(self, a: str, b: str, c: str, d: str, out: Optional[str] = None) -> str:
        """8T CMOS 4-Input NAND."""
        y = out or self.new_net("nand4")
        m1 = self.new_net("n4m1")
        m2 = self.new_net("n4m2")
        m3 = self.new_net("n4m3")
        self.add_pmos(a, self.vcc_net, y)
        self.add_pmos(b, self.vcc_net, y)
        self.add_pmos(c, self.vcc_net, y)
        self.add_pmos(d, self.vcc_net, y)
        self.add_nmos(a, y, m1)
        self.add_nmos(b, m1, m2)
        self.add_nmos(c, m2, m3)
        self.add_nmos(d, m3, self.gnd_net)
        self.mark_driven(y)
        return y

    def NOR4(self, a: str, b: str, c: str, d: str, out: Optional[str] = None) -> str:
        """8T CMOS 4-Input NOR."""
        y = out or self.new_net("nor4")
        m1 = self.new_net("p4m1")
        m2 = self.new_net("p4m2")
        m3 = self.new_net("p4m3")
        self.add_pmos(a, self.vcc_net, m1)
        self.add_pmos(b, m1, m2)
        self.add_pmos(c, m2, m3)
        self.add_pmos(d, m3, y)
        self.add_nmos(a, y, self.gnd_net)
        self.add_nmos(b, y, self.gnd_net)
        self.add_nmos(c, y, self.gnd_net)
        self.add_nmos(d, y, self.gnd_net)
        self.mark_driven(y)
        return y

    def AND2(self, a: str, b: str, out: Optional[str] = None) -> str:
        """6T CMOS 2-Input AND."""
        return self.NOT(self.NAND2(a, b), out)

    def OR2(self, a: str, b: str, out: Optional[str] = None) -> str:
        """6T CMOS 2-Input OR."""
        return self.NOT(self.NOR2(a, b), out)

    def AND3(self, a: str, b: str, c: str, out: Optional[str] = None) -> str:
        """8T CMOS 3-Input AND."""
        return self.NOT(self.NAND3(a, b, c), out)

    def AND4(self, a: str, b: str, c: str, d: str, out: Optional[str] = None) -> str:
        """10T CMOS 4-Input AND."""
        return self.NOT(self.NAND4(a, b, c, d), out)

    def OR4(self, a: str, b: str, c: str, d: str, out: Optional[str] = None) -> str:
        """10T CMOS 4-Input OR."""
        return self.NOT(self.NOR4(a, b, c, d), out)

    def XOR2(self, a: str, b: str, out: Optional[str] = None) -> str:
        """12T Pure Static CMOS XOR2 (zero contention, full rail-to-rail)."""
        y = out or self.new_net("xor2")
        na = self.NOT(a)
        nb = self.NOT(b)
        p1 = self.new_net("xp1")
        p2 = self.new_net("xp2")
        n1 = self.new_net("xn1")
        n2 = self.new_net("xn2")
        # Pull-up: (A=0 & B=1 -> A=0, !B=0) OR (A=1 & B=0 -> !A=0, B=0)
        self.add_pmos(a, self.vcc_net, p1)
        self.add_pmos(nb, p1, y)
        self.add_pmos(na, self.vcc_net, p2)
        self.add_pmos(b, p2, y)
        # Pull-down: (A=1 & B=1) OR (!A=1 & !B=1)
        self.add_nmos(a, y, n1)
        self.add_nmos(b, n1, self.gnd_net)
        self.add_nmos(na, y, n2)
        self.add_nmos(nb, n2, self.gnd_net)
        self.mark_driven(y)
        return y

    def MUX2_1(
        self,
        d0: str,
        d1: str,
        sel: str,
        sel_n: Optional[str] = None,
        out: Optional[str] = None,
    ) -> str:
        """12T (shared sel_n) or 14T glitch-short-free CMOS 2:1 MUX."""
        sn = sel_n if sel_n is not None else self.NOT(sel)
        t0 = self.NAND2(d0, sn)
        t1 = self.NAND2(d1, sel)
        return self.NAND2(t0, t1, out)

    def FULL_ADDER(self, a: str, b: str, cin: str) -> Tuple[str, str]:
        """
        28T Classic Static CMOS Mirror Full Adder.
        - Cout_n = !(A*B + Cin*(A+B)) -> 10T + 2T inv = 12T
        - Sum_n  = !(A*B*Cin + Cout_n*(A+B+Cin)) -> 14T + 2T inv = 16T
        Total: 28T, 100% complementary static CMOS, zero contention.
        """
        cout_n = self.new_net("fa_cn")
        # Cout_n Pull-Up (5 PMOS): !(A*B) & !(Cin*(A+B)) -> (A|B) in series with (Cin | (A&B))
        # Dual of PDN (A*B + Cin*(A+B)):
        # PUN = (A_p || B_p) in series with (Cin_p || (A_p2 -- B_p2))?
        # Even simpler exact dual:
        # PDN: (A & B) || (Cin & (A || B)) -> 5 NMOS
        # PUN: (A || B) & (Cin || (A & B)) -> Wait: let's write exact dual of A*B + Cin*(A+B):
        # F_bar = !(A*B + Cin*(A+B)) = (!A + !B) * (!Cin + !A*!B)
        # Wait: A*B + Cin*(A+B) is self-dual! So PUN and PDN have the EXACT SAME topology!
        # Let's verify:
        #   PUN conducts when F_bar = 1, i.e., MAJ(A,B,Cin)=0, i.e., at least two of A,B,Cin are 0!
        #   If PUN has: (A_p in series with B_p) || (Cin_p in series with (A_p2 || B_p2)):
        #     - A=0,B=0 -> branch 1 conducts (1)
        #     - Cin=0,A=0 -> branch 2 conducts (1)
        #     - Cin=0,B=0 -> branch 2 conducts (1)
        #     - Otherwise (at least two 1s) -> neither conducts (0)!
        #   EXACTLY SELF-DUAL! 5 PMOS + 5 NMOS = 10T!
        p_ab = self.new_net("fa_pab")
        p_c = self.new_net("fa_pc")
        self.add_pmos(a, self.vcc_net, p_ab)
        self.add_pmos(b, p_ab, cout_n)
        self.add_pmos(a, self.vcc_net, p_c)
        self.add_pmos(b, self.vcc_net, p_c)
        self.add_pmos(cin, p_c, cout_n)

        n_ab = self.new_net("fa_nab")
        n_c = self.new_net("fa_nc")
        self.add_nmos(a, cout_n, n_ab)
        self.add_nmos(b, n_ab, self.gnd_net)
        self.add_nmos(cin, cout_n, n_c)
        self.add_nmos(a, n_c, self.gnd_net)
        self.add_nmos(b, n_c, self.gnd_net)
        self.mark_driven(cout_n)

        cout = self.NOT(cout_n)  # +2T = 12T

        # Sum_n = !(A*B*Cin + Cout_n*(A + B + Cin))
        # Also self-dual! Let's verify:
        #   PDN (7 NMOS): (A & B & Cin) || (Cout_n & (A || B || Cin))
        #     - 111: A&B&Cin=1 -> Sum_n=0 -> Sum=1 (correct!)
        #     - 100,010,001: Cout_n=1 & (A|B|Cin)=1 -> Sum_n=0 -> Sum=1 (correct!)
        #     - 000: Cout_n=1, A|B|Cin=0 -> PDN=0 -> Sum_n=1 -> Sum=0 (correct!)
        #     - 110,101,011: Cout_n=0, A&B&Cin=0 -> PDN=0 -> Sum_n=1 -> Sum=0 (correct!)
        #   PUN (7 PMOS): (A_p & B_p & Cin_p) || (Cout_n_p & (A_p || B_p || Cin_p))
        #     - 000: A=0,B=0,Cin=0 -> branch 1 conducts -> Sum_n=1 -> Sum=0 (correct!)
        #     - 110,101,011: Cout_n=0 & one of A,B,Cin is 0 -> branch 2 conducts -> Sum_n=1 -> Sum=0 (correct!)
        #     - 111: Cout_n=0, none of A,B,Cin is 0 -> PUN=0 (correct!)
        #     - 100,010,001: Cout_n=1, not all 0 -> PUN=0 (correct!)
        #   100% COMPLEMENTARY! 7 PMOS + 7 NMOS = 14T + 2T inv = 16T! Total = 28T!
        sum_n = self.new_net("fa_sn")
        sp1 = self.new_net("fa_sp1")
        sp2 = self.new_net("fa_sp2")
        sp_or = self.new_net("fa_spo")
        self.add_pmos(a, self.vcc_net, sp1)
        self.add_pmos(b, sp1, sp2)
        self.add_pmos(cin, sp2, sum_n)
        self.add_pmos(a, self.vcc_net, sp_or)
        self.add_pmos(b, self.vcc_net, sp_or)
        self.add_pmos(cin, self.vcc_net, sp_or)
        self.add_pmos(cout_n, sp_or, sum_n)

        sn1 = self.new_net("fa_sn1")
        sn2 = self.new_net("fa_sn2")
        sn_or = self.new_net("fa_sno")
        self.add_nmos(a, sum_n, sn1)
        self.add_nmos(b, sn1, sn2)
        self.add_nmos(cin, sn2, self.gnd_net)
        self.add_nmos(cout_n, sum_n, sn_or)
        self.add_nmos(a, sn_or, self.gnd_net)
        self.add_nmos(b, sn_or, self.gnd_net)
        self.add_nmos(cin, sn_or, self.gnd_net)
        self.mark_driven(sum_n)

        s = self.NOT(sum_n)  # +2T = 16T
        return s, cout

    def SRAM_CELL_10T(
        self,
        d_bar: str,
        wen: str,
        wen_n: str,
        rst: Optional[str] = None,
        q_out: Optional[str] = None,
    ) -> Tuple[str, str]:
        """
        10T Zero-Contention Static CMOS SRAM / Storage Cell.
        - Inv1 (2T): Q -> Q_bar (or NAND2(Q, rst_n) 4T when async active-low reset is needed)
        - Tristate Feedback Inv2 (4T): Q_bar -> Q when wen=0, wen_n=1
        - Tristate Write Driver (4T): d_bar -> Q when wen=1, wen_n=0
        - Power-on PULL_DOWN on Q initializes Q=0, Q_bar=1 cleanly at t=0.
        Glitch-short-free under any (wen, wen_n) skew!
        """
        q = q_out or self.new_net("q")
        q_bar = self.new_net("qb")

        # Power-on deterministic init to Q=0
        self.add_pull_down(q)

        # Inv1: Q -> Q_bar (or reset-capable)
        if rst is None:
            self.NOT(q, q_bar)
        else:
            self.NAND2(q, rst, q_bar)

        # Tristate Feedback Inv2 (enabled when wen=0, wen_n=1)
        fp = self.new_net("fp")
        fn = self.new_net("fn")
        self.add_pmos(q_bar, self.vcc_net, fp)
        self.add_pmos(wen, fp, q)
        self.add_nmos(q_bar, q, fn)
        self.add_nmos(wen_n, fn, self.gnd_net)

        # Tristate Write Driver (enabled when wen=1, wen_n=0)
        wp = self.new_net("wp")
        wn = self.new_net("wn")
        self.add_pmos(d_bar, self.vcc_net, wp)
        self.add_pmos(wen_n, wp, q)
        self.add_nmos(d_bar, q, wn)
        self.add_nmos(wen, wn, self.gnd_net)

        self.mark_driven(q)
        self.mark_driven(q_bar)
        return q, q_bar

    def NON_OVERLAPPING_CLOCK(self, clk: str) -> Tuple[str, str, str, str]:
        """
        Classic Mead-Conway 2-Phase Non-Overlapping Clock Generator (20T).
        Guarantees PHI1 and PHI2 are NEVER simultaneously HIGH, eliminating
        Master-Slave flip-flop shoot-through!
        Returns (phi1, phi1_n, phi2, phi2_n).
        - phi1 = 1 when clk = 0 (Master transparent)
        - phi2 = 1 when clk = 1 (Slave transparent)
        """
        clk_n = self.NOT(clk)
        phi1 = self.new_net("phi1")
        phi2 = self.new_net("phi2")
        self.add_pull_down(phi2)
        # Branch 1 (active when clk=0): NOR2(clk, phi2) -> BUF -> phi1
        n1 = self.NOR2(clk, phi2)
        self.BUF(n1, phi1)
        # Branch 2 (active when clk=1): NOR2(clk_n, phi1) -> BUF -> phi2
        n2 = self.NOR2(clk_n, phi1)
        self.BUF(n2, phi2)
        phi1_n = self.NOT(phi1)
        phi2_n = self.NOT(phi2)
        return phi1, phi1_n, phi2, phi2_n

    def DFF(
        self,
        d: str,
        phi1: str,
        phi1_n: str,
        phi2: str,
        phi2_n: str,
        rst_n: Optional[str] = None,
        q_out: Optional[str] = None,
    ) -> Tuple[str, str]:
        """
        22T (or 26T with async active-low rst_n) Master-Slave Rising-Edge D-FF
        driven by non-overlapping 2-phase clocks (phi1, phi2).
        - Master transparent when phi1=1 (clk=0)
        - Slave transparent when phi2=1 (clk=1)
        100% immune to clock-skew shoot-through!
        """
        d_bar = self.NOT(d)
        m_q, m_qb = self.SRAM_CELL_10T(d_bar, wen=phi1, wen_n=phi1_n, rst=rst_n)
        s_q, s_qb = self.SRAM_CELL_10T(m_qb, wen=phi2, wen_n=phi2_n, rst=rst_n, q_out=q_out)
        return s_q, s_qb

    def DECODER_2TO4(self, a0: str, a1: str) -> List[str]:
        na0 = self.NOT(a0)
        na1 = self.NOT(a1)
        return [
            self.AND2(na1, na0),
            self.AND2(na1, a0),
            self.AND2(a1, na0),
            self.AND2(a1, a0),
        ]

    def DECODER_3TO8(self, a0: str, a1: str, a2: str) -> List[str]:
        na0 = self.NOT(a0)
        na1 = self.NOT(a1)
        na2 = self.NOT(a2)
        outs = []
        for i in range(8):
            b0 = a0 if (i & 1) else na0
            b1 = a1 if (i & 2) else na1
            b2 = a2 if (i & 4) else na2
            outs.append(self.AND3(b2, b1, b0))
        return outs

    def DECODER_4TO16(self, bits: Sequence[str]) -> List[str]:
        lo = self.DECODER_2TO4(bits[0], bits[1])
        hi = self.DECODER_2TO4(bits[2], bits[3])
        return [self.AND2(hi[h], lo[l]) for h in range(4) for l in range(4)]

    def DECODER_5TO32(self, bits: Sequence[str]) -> List[str]:
        lo = self.DECODER_3TO8(bits[0], bits[1], bits[2])
        hi = self.DECODER_2TO4(bits[3], bits[4])
        return [self.AND2(hi[h], lo[l]) for h in range(4) for l in range(8)]

    def DECODER_6TO64(self, bits: Sequence[str]) -> List[str]:
        lo = self.DECODER_3TO8(bits[0], bits[1], bits[2])
        hi = self.DECODER_3TO8(bits[3], bits[4], bits[5])
        return [self.AND2(hi[h], lo[l]) for h in range(8) for l in range(8)]

    def MUX16_1_ONEHOT(self, inputs: Sequence[str], onehot: Sequence[str]) -> str:
        """
        Compact 104T 16-to-1 selector using one-hot decoded select lines:
        - 16 x NAND2(in[i], sel[i]) = 64T
        - 4 x NAND4 (produces OR of each group of 4) = 32T
        - 1 x NOR4 + NOT -> OR4 = 10T (total 106T per bit!)
        """
        assert len(inputs) == 16 and len(onehot) == 16
        terms = [self.NAND2(inputs[i], onehot[i]) for i in range(16)]
        g = [self.NAND4(terms[4 * k], terms[4 * k + 1], terms[4 * k + 2], terms[4 * k + 3]) for k in range(4)]
        return self.OR4(g[0], g[1], g[2], g[3])

    def MUX64_1_ONEHOT(self, inputs: Sequence[str], onehot: Sequence[str]) -> str:
        """
        Compact 434T 64-to-1 selector using one-hot decoded select lines:
        - 64 x NAND2 = 256T
        - 16 x NAND4 = 128T
        - 4 x NOR4 = 32T
        - 1 x NAND4 = 8T (since NOR4 inverted, NAND4 gives OR of the 4 groups!)
        Total: 424T per bit!
        """
        assert len(inputs) == 64 and len(onehot) == 64
        terms = [self.NAND2(inputs[i], onehot[i]) for i in range(64)]
        l1 = [self.NAND4(terms[4 * k], terms[4 * k + 1], terms[4 * k + 2], terms[4 * k + 3]) for k in range(16)]
        l2 = [self.NOR4(l1[4 * k], l1[4 * k + 1], l1[4 * k + 2], l1[4 * k + 3]) for k in range(4)]
        return self.NAND4(l2[0], l2[1], l2[2], l2[3])

    # =========================================================================
    # 3. Wire Emission & Electrical Rule Check (ERC)
    # =========================================================================

    def build_document(self) -> Tuple[dict, dict]:
        """Emits wires, runs full ERC validation, and returns (CircuitDocument, report)."""
        wires: List[dict] = []
        w_seq = 0
        for net_name, pins in self.nets.items():
            if len(pins) < 2:
                continue
            # Deduplicate endpoints on the same net
            uniq_pins = list(dict.fromkeys(pins))
            if len(uniq_pins) < 2:
                continue
            root_c, root_p = uniq_pins[0]
            for c, p in uniq_pins[1:]:
                w_seq += 1
                wires.append({
                    "id": f"w{w_seq}",
                    "from": {"componentId": root_c, "pinId": root_p},
                    "to": {"componentId": c, "pinId": p},
                })

        # ERC Checks
        nmos_total = sum(1 for c in self.components if c["type"] == "NMOS")
        pmos_total = sum(1 for c in self.components if c["type"] == "PMOS")
        tx_total = nmos_total + pmos_total

        # Map (comp_id, pin_id) -> net_name
        pin_net: Dict[Tuple[str, str], str] = {}
        for net_name, pins in self.nets.items():
            for ep in pins:
                pin_net[ep] = net_name

        floating_gates = 0
        floating_sd = 0
        direct_vcc_gnd_shorts = 0

        # Check VCC/GND never on same net
        vcc_pins = {ep for n in self.rail_vcc_nets for ep in self.nets.get(n, [])}
        gnd_pins = {ep for n in self.rail_gnd_nets for ep in self.nets.get(n, [])}
        if vcc_pins & gnd_pins:
            direct_vcc_gnd_shorts += len(vcc_pins & gnd_pins)

        for comp in self.components:
            cid = comp["id"]
            ctype = comp["type"]
            if ctype in ("NMOS", "PMOS"):
                gnet = pin_net.get((cid, "G"))
                dnet = pin_net.get((cid, "D"))
                snet = pin_net.get((cid, "S"))
                if gnet is None or gnet not in self.driven_nets:
                    floating_gates += 1
                if dnet is None or snet is None:
                    floating_sd += 1
                if (dnet == self.vcc_net and snet == self.gnd_net) or (
                    snet == self.vcc_net and dnet == self.gnd_net
                ):
                    direct_vcc_gnd_shorts += 1

        # Grid alignment & overlap check
        off_grid = 0
        occupied = set()
        overlaps = 0
        for comp in self.components:
            x, y = comp["x"], comp["y"]
            if x % GRID != 0 or y % GRID != 0:
                off_grid += 1
            key = (x, y)
            if key in occupied:
                overlaps += 1
            occupied.add(key)

        report = {
            "nmos": nmos_total,
            "pmos": pmos_total,
            "transistors": tx_total,
            "components": len(self.components),
            "wires": len(wires),
            "nets": len(self.nets),
            "floating_gates": floating_gates,
            "floating_sd": floating_sd,
            "direct_vcc_gnd_shorts": direct_vcc_gnd_shorts,
            "off_grid": off_grid,
            "overlaps": overlaps,
            "blocks": {
                name: {
                    "nmos": b.nmos_count,
                    "pmos": b.pmos_count,
                    "total": b.nmos_count + b.pmos_count,
                }
                for name, b in self.blocks.items()
            },
        }

        doc = {
            "version": 1,
            "name": self.circuit_name,
            "components": self.components,
            "wires": wires,
        }
        return doc, report


# =============================================================================
# 4. WS-16 Machine Code Assembler (16-Bit Fixed-Width RISC ISA)
# =============================================================================
# Encoding:
#   [15:12] opcode (4b)
#   [11:8]  Rd     (4b)
#   [7:4]   Rs1    (4b)  or imm8[7:4] / addr8[7:4]
#   [3:0]   Rs2    (4b)  or imm8[3:0] / addr8[3:0]

OP_NOP     = 0x0
OP_LDI     = 0x1
OP_ADD     = 0x2
OP_SUB     = 0x3
OP_AND     = 0x4
OP_OR      = 0x5
OP_XOR     = 0x6
OP_SHL     = 0x7
OP_SHR     = 0x8
OP_LOAD    = 0x9
OP_STORE   = 0xA
OP_JMP     = 0xB
OP_JZ      = 0xC
OP_JNZ     = 0xD
OP_OUT_LCD = 0xE
OP_HALT    = 0xF


def enc_r(op: int, rd: int, rs1: int, rs2: int) -> int:
    return ((op & 0xF) << 12) | ((rd & 0xF) << 8) | ((rs1 & 0xF) << 4) | (rs2 & 0xF)


def enc_i(op: int, rd: int, imm8: int) -> int:
    return ((op & 0xF) << 12) | ((rd & 0xF) << 8) | (imm8 & 0xFF)


def build_rom_program() -> List[int]:
    """
    32-word (32 x 16-bit) interactive ROM program for WS-16:
      - R15 is hardware-mapped to User Switches: bit0 = SW_MODE, bit1 = SW_DIR
      - Mode 0 (SW_MODE=0): Animated diagonal wave scanner on 8x8 LCD!
          - Shifts an active bit pattern left (DIR=0) or right (DIR=1),
            stores each row pattern in 64x16 SRAM, reads it back, and drives
            the 8x8 PIXEL_MATRIX via OUT_LCD.
      - Mode 1 (SW_MODE=1): Live 16-bit Fibonacci sequence visualizer!
          - Computes F(n) = F(n-1) + F(n-2) using the 16-bit ALU, saves it to
            SRAM[row], loads it back, and displays the binary bits across the
            8 rows of the 8x8 PIXEL_MATRIX.
    """
    prog = [
        # --- Boot / Init (PC 0..6) ---
        enc_i(OP_LDI, 1, 0x01),        # 0:  R1 = 1 (constant 1 / bit mask)
        enc_i(OP_LDI, 2, 0x00),        # 1:  R2 = 0 (current LCD row Y = 0..7)
        enc_i(OP_LDI, 3, 0x03),        # 2:  R3 = 0x03 (2-pixel moving wave bar)
        enc_i(OP_LDI, 4, 0x07),        # 3:  R4 = 0x07 (row wrap mask 0..7)
        enc_i(OP_LDI, 5, 0x01),        # 4:  R5 = 1 (Fibonacci prev)
        enc_i(OP_LDI, 6, 0x01),        # 5:  R6 = 1 (Fibonacci curr)
        enc_i(OP_LDI, 10, 0x02),       # 6:  R10 = 2 (DIR switch mask bit1)

        # --- Main Loop (PC 7): Check SW_MODE (R15 & R1) ---
        enc_r(OP_AND, 7, 15, 1),       # 7:  R7 = R15 & 1 (SW_MODE)
        enc_i(OP_JNZ, 0, 20),          # 8:  if SW_MODE == 1 -> jump to Fib Mode (PC 20)

        # --- Mode 0: Interactive Moving Wave Scanner (PC 9..19) ---
        enc_r(OP_AND, 7, 15, 10),      # 9:  R7 = R15 & 2 (SW_DIR)
        enc_i(OP_JNZ, 0, 14),          # 10: if SW_DIR == 1 -> shift right (PC 14)
        enc_r(OP_SHL, 3, 3, 0),        # 11: R3 = R3 << 1
        enc_i(OP_JNZ, 0, 16),          # 12: if R3 != 0 -> draw (PC 16)
        enc_i(OP_LDI, 3, 0x03),        # 13: wrap reload R3 = 0x03
        enc_i(OP_JMP, 0, 16),          # 14: (note: target 14 is SHR below — fixed!)
    ]

    # Let's assemble cleanly with exact indices:
    prog = [
        # 0..6: Init
        enc_i(OP_LDI, 1, 0x01),        # 0:  R1 = 1
        enc_i(OP_LDI, 2, 0x00),        # 1:  R2 = 0 (row Y)
        enc_i(OP_LDI, 3, 0x03),        # 2:  R3 = 0x03 (wave pattern)
        enc_i(OP_LDI, 4, 0x07),        # 3:  R4 = 0x07 (row mask)
        enc_i(OP_LDI, 5, 0x01),        # 4:  R5 = 1 (Fib A)
        enc_i(OP_LDI, 6, 0x01),        # 5:  R6 = 1 (Fib B)
        enc_i(OP_LDI, 10, 0x02),       # 6:  R10 = 2 (DIR mask)

        # 7..8: Dispatch Mode
        enc_r(OP_AND, 7, 15, 1),       # 7:  R7 = SW_MODE (R15 & 1)
        enc_i(OP_JNZ, 0, 22),          # 8:  if SW_MODE == 1 -> Fib Mode (22)

        # 9..18: Mode 0 — Wave Scanner (DIR=0: SHL, DIR=1: SHR)
        enc_r(OP_AND, 7, 15, 10),      # 9:  R7 = SW_DIR (R15 & 2)
        enc_i(OP_JNZ, 0, 15),          # 10: if SW_DIR == 1 -> SHR path (15)
        enc_r(OP_SHL, 3, 3, 0),        # 11: R3 = R3 << 1
        enc_i(OP_JNZ, 0, 18),          # 12: if R3 != 0 -> render (18)
        enc_i(OP_LDI, 3, 0x03),        # 13: wrap R3 = 0x03
        enc_i(OP_JMP, 0, 18),          # 14: -> render (18)

        enc_r(OP_SHR, 3, 3, 0),        # 15: R3 = R3 >> 1
        enc_i(OP_JNZ, 0, 18),          # 16: if R3 != 0 -> render (18)
        enc_i(OP_LDI, 3, 0xC0),        # 17: wrap R3 = 0xC0

        # 18..21: Store to SRAM, Load back, Output to LCD row R2, Next Row
        enc_r(OP_STORE, 0, 2, 3),      # 18: SRAM[R2] = R3
        enc_r(OP_LOAD, 9, 2, 0),       # 19: R9 = SRAM[R2]
        enc_r(OP_OUT_LCD, 0, 2, 9),    # 20: LCD_ROW[R2[2:0]] = R9[7:0]
        enc_i(OP_JMP, 0, 28),          # 21: -> advance row (28)

        # 22..27: Mode 1 — 16-Bit Fibonacci Visualizer
        enc_r(OP_ADD, 8, 5, 6),        # 22: R8 = R5 + R6
        enc_r(OP_OR, 5, 6, 0),         # 23: R5 = R6 (R0 = 0)
        enc_r(OP_OR, 6, 8, 0),         # 24: R6 = R8
        enc_r(OP_STORE, 0, 2, 8),      # 25: SRAM[R2] = R8
        enc_r(OP_LOAD, 9, 2, 0),       # 26: R9 = SRAM[R2]
        enc_r(OP_OUT_LCD, 0, 2, 9),    # 27: LCD_ROW[R2[2:0]] = R9[7:0]

        # 28..31: Advance Row & Loop
        enc_r(OP_ADD, 2, 2, 1),        # 28: R2 = R2 + 1
        enc_r(OP_AND, 2, 2, 4),        # 29: R2 = R2 & 7
        enc_i(OP_JMP, 0, 7),           # 30: loop back to PC 7
        enc_r(OP_HALT, 0, 0, 0),       # 31: HALT sentinel
    ]
    assert len(prog) == 32
    return prog


# =============================================================================
# 5. Full 16-Bit RISC Computer Synthesizer (WS-16)
# =============================================================================

def synthesize_ws16_computer() -> Tuple[dict, dict]:
    nb = NetlistBuilder("WS-16: 16-Bit RISC Computer (30,000+ Transistors)")

    # Macro-Block Floorplan (non-overlapping 20px-aligned silicon die regions)
    # -------------------------------------------------------------------------
    # Block 0 (I/O Panel & Clock): x=0..1800,     y=0..1800
    # Block 1 (Control & ROM):     x=2000..8600,  y=0..3800
    # Block 2 (16-Bit ALU):        x=0..8600,     y=4200..9000
    # Block 3 (RegFile + PC/IR/SP):x=9000..18600, y=0..9000
    # Block 4 (64x16 SRAM):        x=0..18600,    y=9400..20000
    # Block 5 (MMIO LCD Driver):   x=19000..23000,y=0..6000
    nb.define_block("IO_CLOCK",   1200,   120, cols=10)
    nb.define_block("CONTROL_ROM",2000,   120, cols=100)
    nb.define_block("ALU_16BIT",   120,  4200, cols=135)
    nb.define_block("REGFILE",    9000,   120, cols=150)
    nb.define_block("SRAM_64X16",  120,  9400, cols=290)
    nb.define_block("MMIO_LCD",  19000,   120, cols=60)

    # =========================================================================
    # BLOCK 0: Front I/O Panel (8x8 LCD, Switches, LEDs) & Divided Ring-Osc Clock
    # =========================================================================
    nb.set_block("IO_CLOCK")

    # 8x8 Raw Pixel Matrix (LCD) at top-left (center 360, 320 -> spans x:180..540, y:140..500)
    lcd_id = nb.add_component(
        "PIXEL_MATRIX", 360, 320, comp_id="lcd_matrix", matrixSize=8, color="cyan", label="WS-16 LCD"
    )

    # User Switches (stacked cleanly at x=100, y=620..1020; NO forbidden keyBindings!)
    sw_auto_id = nb.add_component(
        "TOGGLE_SWITCH", 100, 620, comp_id="sw_auto_clk", label="AUTO CLK", state=True, keyBinding="A"
    )
    btn_clk_id = nb.add_component(
        "PUSH_BUTTON", 100, 700, comp_id="btn_step_clk", label="STEP CLK", state=False, keyBinding="C"
    )
    sw_rst_id = nb.add_component(
        "TOGGLE_SWITCH", 100, 780, comp_id="sw_reset", label="RESET", state=False, keyBinding="Z"
    )
    sw_mode_id = nb.add_component(
        "TOGGLE_SWITCH", 100, 860, comp_id="sw_mode", label="MODE (WAVE/FIB)", state=False, keyBinding="M"
    )
    sw_dir_id = nb.add_component(
        "TOGGLE_SWITCH", 100, 940, comp_id="sw_dir", label="DIR (L/R)", state=False, keyBinding="D"
    )

    net_sw_auto = "SW_AUTO_CLK"
    net_btn_clk = "BTN_STEP_CLK"
    net_rst = "SYS_RESET"
    net_sw_mode = "SW_MODE"
    net_sw_dir = "SW_DIR"

    for net_n, cid in [
        (net_sw_auto, sw_auto_id),
        (net_btn_clk, btn_clk_id),
        (net_rst, sw_rst_id),
        (net_sw_mode, sw_mode_id),
        (net_sw_dir, sw_dir_id),
    ]:
        nb.connect(net_n, cid, "OUT")
        nb.mark_driven(net_n)

    net_rst_n = nb.NOT(net_rst, "SYS_RESET_N")

    # On-Chip 7-Stage Gated CMOS Ring Oscillator + 3-Stage Ripple Clock Divider
    # When SW_AUTO_CLK=1, oscillates with period ~112 ticks (plenty of settling margin!)
    osc_raw = nb.new_net("osc_raw")
    osc_s0 = nb.NAND2(net_sw_auto, osc_raw)
    osc_s1 = nb.NOT(osc_s0)
    osc_s2 = nb.NOT(osc_s1)
    osc_s3 = nb.NOT(osc_s2)
    osc_s4 = nb.NOT(osc_s3)
    osc_s5 = nb.NOT(osc_s4)
    nb.NOT(osc_s5, osc_raw)
    nb.add_pull_down(osc_raw)

    # 2-bit Ripple Divider (divides 7-stage ring osc by 4 -> ~56 ticks/cycle, >2x ALU settling margin)
    div_clk = osc_raw
    for _ in range(2):
        dp1, dp1_n, dp2, dp2_n = nb.NON_OVERLAPPING_CLOCK(div_clk)
        div_d = nb.new_net("div_d")
        div_q, div_qb = nb.DFF(div_d, dp1, dp1_n, dp2, dp2_n, rst_n=net_rst_n)
        nb.BUF(div_qb, div_d)
        div_clk = div_q

    auto_clk_gated = nb.AND2(net_sw_auto, div_clk)
    sys_clk = nb.OR2(auto_clk_gated, net_btn_clk, "SYS_CLK")
    phi1, phi1_n, phi2, phi2_n = nb.NON_OVERLAPPING_CLOCK(sys_clk)

    # Forward-declared inter-block buses (16-bit)
    pc_q = [f"PC_{i}" for i in range(16)]
    ir_q = [f"IR_{i}" for i in range(16)]
    sp_q = [f"SP_{i}" for i in range(16)]
    alu_res = [f"ALU_Y_{i}" for i in range(16)]
    rf_a = [f"RF_A_{i}" for i in range(16)]
    rf_b = [f"RF_B_{i}" for i in range(16)]
    sram_dout = [f"SRAM_DO_{i}" for i in range(16)]

    # =========================================================================
    # BLOCK 1: Control Unit (Fetch-Decode-Execute FSM, 4-to-16 Decoder) & ROM
    # =========================================================================
    nb.set_block("CONTROL_ROM")

    # 3-State FSM: (F1, F0) -> 00=FETCH, 01=DECODE, 10=EXECUTE
    f0_next = nb.new_net("fsm_f0_next")
    f1_next = nb.new_net("fsm_f1_next")
    f0_q, f0_qb = nb.DFF(f0_next, phi1, phi1_n, phi2, phi2_n, rst_n=net_rst_n)
    f1_q, f1_qb = nb.DFF(f1_next, phi1, phi1_n, phi2, phi2_n, rst_n=net_rst_n)

    st_fetch = nb.AND2(f1_qb, f0_qb, "ST_FETCH")
    st_decode = nb.AND2(f1_qb, f0_q, "ST_DECODE")
    st_exec = nb.AND2(f1_q, f0_qb, "ST_EXEC")

    # Decode 4-bit Opcode from IR[15:12]
    op_dec = nb.DECODER_4TO16(ir_q[12:16])
    op_nop     = op_dec[OP_NOP]
    op_ldi     = op_dec[OP_LDI]
    op_add     = op_dec[OP_ADD]
    op_sub     = op_dec[OP_SUB]
    op_and     = op_dec[OP_AND]
    op_or      = op_dec[OP_OR]
    op_xor     = op_dec[OP_XOR]
    op_shl     = op_dec[OP_SHL]
    op_shr     = op_dec[OP_SHR]
    op_load    = op_dec[OP_LOAD]
    op_store   = op_dec[OP_STORE]
    op_jmp     = op_dec[OP_JMP]
    op_jz      = op_dec[OP_JZ]
    op_jnz     = op_dec[OP_JNZ]
    op_out_lcd = op_dec[OP_OUT_LCD]
    op_halt    = op_dec[OP_HALT]

    # HALT freezes FSM in EXECUTE when op_halt=1
    halt_active = nb.AND2(st_exec, op_halt, "HALT_ACTIVE")
    not_halt = nb.NOT(halt_active)
    nb.AND2(st_fetch, not_halt, f0_next)
    nb.OR2(st_decode, halt_active, f1_next)

    # Control Signals
    is_alu_op = nb.OR2(
        nb.OR4(op_add, op_sub, op_and, op_or),
        nb.OR2(op_xor, nb.OR2(op_shl, op_shr)),
    )
    ctrl_reg_write = nb.AND2(st_exec, nb.OR2(is_alu_op, nb.OR2(op_ldi, op_load)), "CTRL_REG_WR")
    ctrl_mem_write = nb.AND2(st_exec, op_store, "CTRL_MEM_WR")
    ctrl_lcd_write = nb.AND2(st_exec, op_out_lcd, "CTRL_LCD_WR")
    ctrl_flag_write = nb.AND2(st_exec, is_alu_op, "CTRL_FLAG_WR")
    ctrl_ir_load = nb.AND2(st_fetch, not_halt, "CTRL_IR_LD")
    ctrl_pc_en = nb.AND2(st_exec, not_halt, "CTRL_PC_EN")

    # ALU Operation Encoding (3-bit ALU_OP[2:0] + SUB flag)
    # 000=ADD, 001=SUB, 010=AND, 011=OR, 100=XOR, 101=NOT, 110=SHL, 111=SHR
    alu_op0 = nb.OR4(op_sub, op_or, op_shr, nb.gnd_net)
    alu_op1 = nb.OR4(op_and, op_or, op_shl, op_shr)
    alu_op2 = nb.OR4(op_xor, op_shl, op_shr, nb.gnd_net)
    alu_sub = op_sub

    # Hardwired 32 x 16-Bit Program ROM (VCC/GND hardwired bit matrix!)
    rom_words = build_rom_program()
    rom_sel = nb.DECODER_5TO32(pc_q[0:5])
    rom_dout: List[str] = []
    for bit in range(16):
        # Collect all addresses where this bit == 1, OR their rom_sel lines!
        ones = [rom_sel[addr] for addr in range(32) if (rom_words[addr] >> bit) & 1]
        if not ones:
            rom_dout.append(nb.gnd_net)
        elif len(ones) == 1:
            rom_dout.append(ones[0])
        else:
            # Balanced OR tree of active ROM wordlines
            layer = list(ones)
            while len(layer) > 1:
                nxt = []
                i = 0
                while i < len(layer):
                    chunk = layer[i : i + 4]
                    if len(chunk) == 4:
                        nxt.append(nb.OR4(chunk[0], chunk[1], chunk[2], chunk[3]))
                    elif len(chunk) == 3:
                        nxt.append(nb.NOT(nb.NOR3(chunk[0], chunk[1], chunk[2])))
                    elif len(chunk) == 2:
                        nxt.append(nb.OR2(chunk[0], chunk[1]))
                    else:
                        nxt.append(chunk[0])
                    i += 4
                layer = nxt
            rom_dout.append(layer[0])

    # =========================================================================
    # BLOCK 2: 16-Bit ALU (Adder/Subtractor, Bitwise, Barrel Shifter, Flags)
    # =========================================================================
    nb.set_block("ALU_16BIT")

    # 2.1 16-Bit Ripple-Carry Adder / 2's-Complement Subtractor
    add_sum: List[str] = []
    carry = alu_sub  # Cin = 1 for A - B = A + (~B) + 1
    for i in range(16):
        b_eff = nb.XOR2(rf_b[i], alu_sub)
        s_i, carry = nb.FULL_ADDER(rf_a[i], b_eff, carry)
        add_sum.append(s_i)
    alu_cout = carry

    # 2.2 16-Bit Bitwise Units (AND, OR, XOR, NOT)
    bw_and = [nb.AND2(rf_a[i], rf_b[i]) for i in range(16)]
    bw_or  = [nb.OR2(rf_a[i], rf_b[i]) for i in range(16)]
    bw_xor = [nb.XOR2(rf_a[i], rf_b[i]) for i in range(16)]
    bw_not = [nb.NOT(rf_a[i]) for i in range(16)]

    # 2.3 16-Bit Multi-Stage Barrel Shifter (1-bit, 2-bit, 4-bit Left & Right)
    # Shift amount defaults to 1-bit for SHL/SHR, or rf_b[2:0] when non-zero!
    sh_amt0 = nb.OR2(nb.vcc_net, rf_b[0])  # 1-bit shift active
    sh_amt1 = rf_b[1]
    sh_amt2 = rf_b[2]
    sh_amt0_n = nb.NOT(sh_amt0)
    sh_amt1_n = nb.NOT(sh_amt1)
    sh_amt2_n = nb.NOT(sh_amt2)

    # Left Barrel Shifter (stages 1, 2, 4)
    shl_s1 = [nb.MUX2_1(rf_a[i], rf_a[i - 1] if i >= 1 else nb.gnd_net, sh_amt0, sh_amt0_n) for i in range(16)]
    shl_s2 = [nb.MUX2_1(shl_s1[i], shl_s1[i - 2] if i >= 2 else nb.gnd_net, sh_amt1, sh_amt1_n) for i in range(16)]
    shl_out = [nb.MUX2_1(shl_s2[i], shl_s2[i - 4] if i >= 4 else nb.gnd_net, sh_amt2, sh_amt2_n) for i in range(16)]

    # Right Barrel Shifter (stages 1, 2, 4)
    shr_s1 = [nb.MUX2_1(rf_a[i], rf_a[i + 1] if i < 15 else nb.gnd_net, sh_amt0, sh_amt0_n) for i in range(16)]
    shr_s2 = [nb.MUX2_1(shr_s1[i], shr_s1[i + 2] if i < 14 else nb.gnd_net, sh_amt1, sh_amt1_n) for i in range(16)]
    shr_out = [nb.MUX2_1(shr_s2[i], shr_s2[i + 4] if i < 12 else nb.gnd_net, sh_amt2, sh_amt2_n) for i in range(16)]

    # 2.4 8-to-1 ALU Output Operation MUX (16 bits)
    op0_n = nb.NOT(alu_op0)
    op1_n = nb.NOT(alu_op1)
    op2_n = nb.NOT(alu_op2)
    for i in range(16):
        m0 = nb.MUX2_1(add_sum[i], add_sum[i], alu_op0, op0_n)  # 000 ADD / 001 SUB
        m1 = nb.MUX2_1(bw_and[i],  bw_or[i],   alu_op0, op0_n)  # 010 AND / 011 OR
        m2 = nb.MUX2_1(bw_xor[i],  bw_not[i],  alu_op0, op0_n)  # 100 XOR / 101 NOT
        m3 = nb.MUX2_1(shl_out[i], shr_out[i], alu_op0, op0_n)  # 110 SHL / 111 SHR
        m01 = nb.MUX2_1(m0, m1, alu_op1, op1_n)
        m23 = nb.MUX2_1(m2, m3, alu_op1, op1_n)
        nb.MUX2_1(m01, m23, alu_op2, op2_n, out=alu_res[i])

    # 2.5 Status Flags (Zero Z, Carry C, Negative N) + Flag Register D-FFs
    z_g0 = nb.NOR4(alu_res[0], alu_res[1], alu_res[2], alu_res[3])
    z_g1 = nb.NOR4(alu_res[4], alu_res[5], alu_res[6], alu_res[7])
    z_g2 = nb.NOR4(alu_res[8], alu_res[9], alu_res[10], alu_res[11])
    z_g3 = nb.NOR4(alu_res[12], alu_res[13], alu_res[14], alu_res[15])
    flag_z_raw = nb.AND4(z_g0, z_g1, z_g2, z_g3)
    flag_c_raw = nb.BUF(alu_cout)
    flag_n_raw = nb.BUF(alu_res[15])

    # Clocked Flag Register (holds Z, C, N updated when ctrl_flag_write=1)
    fw_n = nb.NOT(ctrl_flag_write)
    flag_z_d = nb.new_net("fz_d")
    flag_c_d = nb.new_net("fc_d")
    flag_n_d = nb.new_net("fn_d")
    flag_z, flag_z_n = nb.DFF(flag_z_d, phi1, phi1_n, phi2, phi2_n, rst_n=net_rst_n)
    flag_c, _ = nb.DFF(flag_c_d, phi1, phi1_n, phi2, phi2_n, rst_n=net_rst_n)
    flag_n, _ = nb.DFF(flag_n_d, phi1, phi1_n, phi2, phi2_n, rst_n=net_rst_n)
    nb.MUX2_1(flag_z, flag_z_raw, ctrl_flag_write, fw_n, out=flag_z_d)
    nb.MUX2_1(flag_c, flag_c_raw, ctrl_flag_write, fw_n, out=flag_c_d)
    nb.MUX2_1(flag_n, flag_n_raw, ctrl_flag_write, fw_n, out=flag_n_d)

    # =========================================================================
    # BLOCK 3: Register File (16 x 16-Bit R0-R15) & Special Regs (PC, IR, SP)
    # =========================================================================
    nb.set_block("REGFILE")

    # 3.1 Instruction Register (IR, 16-bit Master-Slave D-FF)
    ir_ld_n = nb.NOT(ctrl_ir_load)
    for i in range(16):
        ir_d = nb.MUX2_1(ir_q[i], rom_dout[i], ctrl_ir_load, ir_ld_n)
        nb.DFF(ir_d, phi1, phi1_n, phi2, phi2_n, rst_n=net_rst_n, q_out=ir_q[i])

    # 3.2 Program Counter (PC, 16-bit Master-Slave D-FF + 16-bit Incrementer + Branch MUX)
    take_branch = nb.OR2(
        op_jmp,
        nb.OR2(nb.AND2(op_jz, flag_z), nb.AND2(op_jnz, flag_z_n)),
    )
    take_branch_n = nb.NOT(take_branch)
    pc_en_n = nb.NOT(ctrl_pc_en)

    # 16-bit PC + 1 incrementer
    pc_inc: List[str] = []
    c_pc = nb.vcc_net
    for i in range(16):
        s_i = nb.XOR2(pc_q[i], c_pc)
        c_pc = nb.AND2(pc_q[i], c_pc)
        pc_inc.append(s_i)

    for i in range(16):
        branch_target = ir_q[i] if i < 8 else nb.gnd_net
        pc_next_val = nb.MUX2_1(pc_inc[i], branch_target, take_branch, take_branch_n)
        pc_d = nb.MUX2_1(pc_q[i], pc_next_val, ctrl_pc_en, pc_en_n)
        nb.DFF(pc_d, phi1, phi1_n, phi2, phi2_n, rst_n=net_rst_n, q_out=pc_q[i])

    # 3.3 Stack Pointer (SP, 16-bit Master-Slave D-FF + Inc/Dec)
    sp_en = nb.AND2(st_exec, nb.OR2(op_load, op_store))
    sp_en_n = nb.NOT(sp_en)
    sp_dec = op_store
    sp_c = sp_dec
    for i in range(16):
        step_bit = nb.vcc_net if i == 0 else nb.gnd_net
        b_eff = nb.XOR2(step_bit, sp_dec)
        sp_next, sp_c = nb.FULL_ADDER(sp_q[i], b_eff, sp_c)
        sp_d = nb.MUX2_1(sp_q[i], sp_next, sp_en, sp_en_n)
        nb.DFF(sp_d, phi1, phi1_n, phi2, phi2_n, rst_n=net_rst_n, q_out=sp_q[i])

    # 3.4 Register File Write Data MUX (LDI imm8 vs LOAD SRAM vs ALU)
    op_ldi_n = nb.NOT(op_ldi)
    op_load_n = nb.NOT(op_load)
    rf_wdata: List[str] = []
    for i in range(16):
        imm_bit = ir_q[i] if i < 8 else nb.gnd_net
        m_alu_mem = nb.MUX2_1(alu_res[i], sram_dout[i], op_load, op_load_n)
        wd_i = nb.MUX2_1(m_alu_mem, imm_bit, op_ldi, op_ldi_n)
        rf_wdata.append(wd_i)

    # 3.5 Register File 16 x 16-Bit Storage (R0 hardwired 0, R1..R14 RW, R15 = User Switches)
    rd_dec = nb.DECODER_4TO16(ir_q[8:12])
    rs1_dec = nb.DECODER_4TO16(ir_q[4:8])
    rs2_dec = nb.DECODER_4TO16(ir_q[0:4])

    # Write happens on EXECUTE rising clock pulse (2-phase non-overlapping MS-DFFs)
    reg_matrix: List[List[str]] = [[nb.gnd_net] * 16 for _ in range(16)]
    for r in range(16):
        reg_we = nb.AND2(ctrl_reg_write, rd_dec[r])
        reg_we_n = nb.NOT(reg_we)
        for b in range(16):
            if r == 0:
                q_rb, _ = nb.DFF(nb.gnd_net, phi1, phi1_n, phi2, phi2_n, rst_n=net_rst_n)
                reg_matrix[r][b] = q_rb
            elif r == 15:
                d_in = net_sw_mode if b == 0 else (net_sw_dir if b == 1 else nb.gnd_net)
                q_rb, _ = nb.DFF(d_in, phi1, phi1_n, phi2, phi2_n, rst_n=net_rst_n)
                reg_matrix[r][b] = q_rb
            else:
                q_prev = nb.new_net(f"r{r}_{b}_q")
                d_in = nb.MUX2_1(q_prev, rf_wdata[b], reg_we, reg_we_n)
                nb.DFF(d_in, phi1, phi1_n, phi2, phi2_n, rst_n=net_rst_n, q_out=q_prev)
                reg_matrix[r][b] = q_prev

    # Dual Read Ports (16-to-1 one-hot CMOS MUX for Port A and Port B)
    for b in range(16):
        col_bits = [reg_matrix[r][b] for r in range(16)]
        nb.BUF(nb.MUX16_1_ONEHOT(col_bits, rs1_dec), rf_a[b])
        nb.BUF(nb.MUX16_1_ONEHOT(col_bits, rs2_dec), rf_b[b])

    # =========================================================================
    # BLOCK 4: Integrated 64 x 16-Bit (1,024-Bit) Static CMOS SRAM Matrix
    # =========================================================================
    nb.set_block("SRAM_64X16")

    # 6-to-64 Row Address Decoder from RF_A[5:0]
    sram_row_sel = nb.DECODER_6TO64(rf_a[0:6])

    # Shared inverted write data bus (16 inverters)
    sram_din_bar = [nb.NOT(rf_b[b]) for b in range(16)]

    # Gate SRAM write with phi1 so write completes cleanly BEFORE phi2 advances PC/FSM!
    sram_we_clk = nb.AND2(ctrl_mem_write, phi1)

    sram_cells: List[List[str]] = [[""] * 16 for _ in range(64)]
    for row in range(64):
        w_en = nb.AND2(sram_we_clk, sram_row_sel[row])
        w_en_n = nb.NOT(w_en)
        for b in range(16):
            q_cell, _ = nb.SRAM_CELL_10T(sram_din_bar[b], wen=w_en, wen_n=w_en_n)
            sram_cells[row][b] = q_cell

    # 64-to-1 Hierarchical CMOS Readout Tree (16 bits)
    for b in range(16):
        col = [sram_cells[row][b] for row in range(64)]
        nb.BUF(nb.MUX64_1_ONEHOT(col, sram_row_sel), sram_dout[b])

    # =========================================================================
    # BLOCK 5: MMIO 8x8 LCD Framebuffer Driver (64-Bit Pixel Storage + Decoder)
    # =========================================================================
    nb.set_block("MMIO_LCD")

    # 3-to-8 Row Decoder from RF_A[2:0] selects which of the 8 LCD rows to update
    lcd_row_sel = nb.DECODER_3TO8(rf_a[0], rf_a[1], rf_a[2])
    lcd_we_clk = nb.AND2(ctrl_lcd_write, phi1)
    lcd_din_bar = [nb.NOT(rf_b[x]) for x in range(8)]

    for y in range(8):
        row_we = nb.AND2(lcd_we_clk, lcd_row_sel[y])
        row_we_n = nb.NOT(row_we)
        for x in range(8):
            pix_q, _ = nb.SRAM_CELL_10T(lcd_din_bar[x], wen=row_we, wen_n=row_we_n, rst=net_rst_n)
            # Drive physical 8x8 PIXEL_MATRIX pin P_y_x directly!
            nb.connect(pix_q, lcd_id, f"P_{y}_{x}")

    # =========================================================================
    # BLOCK 0 (cont.): Status LEDs on Front I/O Panel
    # =========================================================================
    nb.set_block("IO_CLOCK")
    status_leds = [
        ("led_clk",   sys_clk,          "CLK",  "cyan",  620, 140),
        ("led_halt",  halt_active,      "HALT", "red",   620, 220),
        ("led_fz",    flag_z,           "Z",    "amber", 620, 300),
        ("led_fc",    flag_c,           "C",    "amber", 620, 380),
        ("led_fn",    flag_n,           "N",    "amber", 620, 460),
        ("led_pc0",   pc_q[0],          "PC0",  "green", 720, 140),
        ("led_pc1",   pc_q[1],          "PC1",  "green", 720, 220),
        ("led_pc2",   pc_q[2],          "PC2",  "green", 720, 300),
        ("led_pc3",   pc_q[3],          "PC3",  "green", 720, 380),
        ("led_pc4",   pc_q[4],          "PC4",  "green", 720, 460),
        ("led_r3_0",  reg_matrix[3][0], "D0",   "cyan",  820, 140),
        ("led_r3_1",  reg_matrix[3][1], "D1",   "cyan",  820, 220),
        ("led_r3_2",  reg_matrix[3][2], "D2",   "cyan",  820, 300),
        ("led_r3_3",  reg_matrix[3][3], "D3",   "cyan",  820, 380),
        ("led_fsm_f", st_fetch,         "FET",  "green", 820, 460),
        ("led_fsm_e", st_exec,          "EXE",  "amber", 920, 460),
    ]
    for cid, net_n, lbl, col, lx, ly in status_leds:
        nb.add_component("LED", lx, ly, comp_id=cid, label=lbl, color=col)
        nb.connect(net_n, cid, "IN")

    return nb.build_document()


def main() -> int:
    out_path = os.path.join("public", "projects", "26-16bit-risc-computer-30k.json")
    os.makedirs(os.path.dirname(out_path), exist_ok=True)

    print("[WS-16] Synthesizing 16-Bit RISC Computer from raw NMOS/PMOS transistors...")
    doc, report = synthesize_ws16_computer()

    # Compact JSON for fast network load over Netlify CDN
    raw_json = json.dumps(doc, separators=(",", ":"))
    with open(out_path, "w", encoding="utf-8") as f:
        f.write(raw_json)

    size_mb = len(raw_json) / (1024 * 1024)
    print(f"[WS-16] Written: {out_path} ({size_mb:.2f} MB)")
    print("[WS-16] === SYNTHESIS & ERC REPORT ===")
    print(f"  Total Transistors : {report['transistors']:,} (NMOS: {report['nmos']:,}, PMOS: {report['pmos']:,})")
    print(f"  Total Components  : {report['components']:,}")
    print(f"  Total Wires       : {report['wires']:,}")
    print(f"  Total Nets        : {report['nets']:,}")
    print("  Per-Block Transistor Breakdown:")
    for bname, stats in report["blocks"].items():
        print(f"    - {bname:14s}: {stats['total']:6,d} T (NMOS={stats['nmos']:,}, PMOS={stats['pmos']:,})")
    print("  ERC Checks:")
    print(f"    - Floating Gates        : {report['floating_gates']}")
    print(f"    - Floating Source/Drain : {report['floating_sd']}")
    print(f"    - Direct VCC-GND Shorts : {report['direct_vcc_gnd_shorts']}")
    print(f"    - Off-Grid Components   : {report['off_grid']}")
    print(f"    - Overlapping Coords    : {report['overlaps']}")

    assert report["transistors"] >= 25_000, f"Transistor count {report['transistors']} < 25,000!"
    assert report["floating_gates"] == 0, "Floating gates detected!"
    assert report["floating_sd"] == 0, "Floating source/drain detected!"
    assert report["direct_vcc_gnd_shorts"] == 0, "Direct VCC-GND short detected!"
    assert report["off_grid"] == 0, "Off-grid components detected!"
    assert report["overlaps"] == 0, "Overlapping components detected!"
    print("[WS-16] ALL ERC CHECKS PASSED!")
    return 0


if __name__ == "__main__":
    sys.exit(main())
