import json, os
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import FancyBboxPatch

HERE = os.path.dirname(os.path.abspath(__file__))
D = json.load(open(os.path.join(HERE, "..", "data", "summary.json")))

SURF = "#fcfcfb"; INK = "#0b0b0b"; INK2 = "#52514e"; MUTED = "#898781"
GRID = "#e1e0d9"; BASE = "#c3c2b7"; BLUE = "#2a78d6"; BLUE_L = "#86b6ef"; RED = "#e34948"

plt.rcParams.update({
    "font.family": "DejaVu Sans", "font.size": 11, "text.color": INK,
    "axes.edgecolor": BASE, "axes.labelcolor": INK2, "xtick.color": MUTED, "ytick.color": INK,
    "figure.facecolor": SURF, "axes.facecolor": SURF, "savefig.facecolor": SURF,
})

def rounded_hbar(ax, y, w, h, color):
    # bar anchored at baseline x=0, rounded data-end
    ax.add_patch(FancyBboxPatch((0, y - h / 2), max(w, 0.0001), h,
                                boxstyle="round,pad=0,rounding_size=0.06",
                                mutation_aspect=1, linewidth=0, facecolor=color))

def frame(ax):
    for s in ("top", "right", "left"):
        ax.spines[s].set_visible(False)
    ax.spines["bottom"].set_color(BASE)
    ax.grid(axis="x", color=GRID, linewidth=0.8)
    ax.set_axisbelow(True)
    ax.tick_params(axis="y", length=0)

def footer(fig, text):
    fig.text(0.01, 0.012, text, fontsize=8.5, color=MUTED, ha="left", va="bottom")

# ---------- Chart 1: borrower cost at the strike that funds the docs' yield ----------
req = D["required_strike_for_docs_yield_m115_skip"]
assets = [a for a in req if "cost" in req[a]]
assets.sort(key=lambda a: req[a]["cost"])
costs = [req[a]["cost"] for a in assets]
avg = D["portfolio_avg_cost_pct_of_collateral"]["m1.15"]["skip"]

fig, ax = plt.subplots(figsize=(9, 6.2))
for i, (a, c) in enumerate(zip(assets, costs)):
    rounded_hbar(ax, i, c, 0.62, BLUE)
    ax.text(c + 0.15, i, f"{c:.1f}%", va="center", fontsize=10, color=INK)
ax.set_yticks(range(len(assets)))
ax.set_yticklabels(assets)
ax.set_xlim(0, 11)
ax.set_ylim(-0.7, len(assets) - 0.3)
ax.axvline(0.5, color=RED, linewidth=2, zorder=3)
ax.text(0.62, len(assets) - 0.55, "Spout homepage: \"around 0.5% annualized\"", color=INK, fontsize=9.5, va="center")
ax.axvline(avg, color=INK2, linewidth=1.2, linestyle=(0, (4, 3)), zorder=3)
ax.text(avg + 0.12, -0.55, f"10-asset average {avg:.1f}%", color=INK2, fontsize=9.5, va="center")
ax.set_xlabel("Upside given up by the borrower, % of collateral per year")
frame(ax)
fig.suptitle("To pay the lender yields in Spout's docs, borrowers give up 8 to 10 times\nthe upside the homepage quotes", x=0.01, ha="left", fontsize=14, fontweight="bold", y=0.985)
fig.text(0.01, 0.885, "Weekly calls struck to raise the docs' own example premium (15.6% a year of pool), max LTV, full utilization.\nBacktest Dec 2016 to Sep 2026, earnings weeks skipped (proxy), IV = 1.15 x 60-day realized vol.", fontsize=9.5, color=INK2, ha="left", va="top")
fig.subplots_adjust(left=0.1, right=0.97, top=0.8, bottom=0.12)
footer(fig, "Data: Yahoo Finance daily OHLC. BSOL excluded (33 cycles). Sensitivity: IV/RV 1.0 gives 8.4%, 1.3 gives 2.9%; most generous earnings skip 4.2%.")
fig.savefig(os.path.join(HERE, "1_cost_vs_claim.png"), dpi=160)
plt.close(fig)

# ---------- Chart 2: liquidation within 12 months at max LTV ----------
liq = D["liquidation_within_52w_max_ltv_pct"]
la = [a for a in liq if a != "cols"]
la.sort(key=lambda a: liq[a][1])
fig, ax = plt.subplots(figsize=(9, 6.2))
for i, a in enumerate(la):
    lo, mid, hi = liq[a][2], liq[a][1], liq[a][0]
    ax.plot([lo, hi], [i, i], color=BLUE_L, linewidth=3, solid_capstyle="round", zorder=2)
    ax.scatter([lo, hi], [i, i], s=46, color=BLUE_L, zorder=3, edgecolors=SURF, linewidths=2)
    ax.scatter([mid], [i], s=90, color=BLUE, zorder=4, edgecolors=SURF, linewidths=2)
    ax.text(hi + 1.5, i, f"{mid:.0f}%", va="center", fontsize=10, color=INK)
ax.set_yticks(range(len(la)))
ax.set_yticklabels(la)
ax.set_xlim(0, 100)
ax.set_ylim(-0.7, len(la) - 0.3)
ax.set_xlabel("Share of 12-month windows in which a max-LTV borrower gets liquidated (%)")
frame(ax)
# legend-like direct labels
ax.scatter([], [], s=90, color=BLUE, label="Liquidation line at NVDA's documented 58.8% LTV (15% fall)")
ax.scatter([], [], s=46, color=BLUE_L, label="Range across the docs' 4% to 12.5% buffers (7.4% to 20% fall)")
ax.legend(loc="lower right", frameon=False, fontsize=9.5)
fig.suptitle("\"A 2x collateral buffer from day one\": about half of max-LTV NVDA\nborrowers would have been liquidated within a year", x=0.01, ha="left", fontsize=14, fontweight="bold", y=0.985)
fig.text(0.01, 0.885, "Every weekly entry Dec 2016 to Sep 2025, borrow 50% LTV, hold 52 weeks, no top-up, intraday lows (Stork prices in market hours).\nLabel = % liquidated at the 15% fall that trips NVDA's documented line.", fontsize=9.5, color=INK2, ha="left", va="top")
fig.subplots_adjust(left=0.1, right=0.97, top=0.8, bottom=0.12)
footer(fig, "Data: Yahoo Finance daily OHLC. IBIT from Apr 2024 only. Buffers per asset are not published except NVDA (8.8%).")
fig.savefig(os.path.join(HERE, "2_liquidation_12m.png"), dpi=160)
plt.close(fig)

# ---------- Chart 3: assignment closes the loan (docs mechanics) ----------
ar = D["autoroll_docs_mechanics_kreq_skip"]
aa = [a for a in ar if a != "cols"]
aa.sort(key=lambda a: ar[a][2])
fig, ax = plt.subplots(figsize=(9, 6.2))
for i, a in enumerate(aa):
    p52 = ar[a][2]; med = ar[a][3]
    rounded_hbar(ax, i, p52, 0.62, BLUE)
    ax.text(p52 + 1.2, i, f"{p52:.0f}%  |  median {med:.0f} of 100 shares left", va="center", fontsize=9.5, color=INK)
ax.set_yticks(range(len(aa)))
ax.set_yticklabels(aa)
ax.set_xlim(0, 150)
ax.set_xticks([0, 20, 40, 60, 80, 100])
ax.set_ylim(-0.7, len(aa) - 0.3)
ax.set_xlabel("Share of max-LTV borrowers whose loan is force-repaid by an assignment within 12 months (%)")
frame(ax)
fig.suptitle("Read literally, the docs' Auto-Roll repays your loan and roughly\nhalves your shares the first time your stock rallies", x=0.01, ha="left", fontsize=14, fontweight="bold", y=0.985)
fig.text(0.01, 0.885, "docs/options-assignment: shares sold at strike, \"proceeds first cover any outstanding debt\", residual rebought.\nSame strikes as chart 1, earnings weeks skipped, 50% LTV, 100 shares at entry.", fontsize=9.5, color=INK2, ha="left", va="top")
fig.subplots_adjust(left=0.1, right=0.97, top=0.8, bottom=0.12)
footer(fig, "Data: Yahoo Finance daily OHLC. The homepage FAQ describes a different mechanic (borrower absorbs the difference, keeps shares).")
fig.savefig(os.path.join(HERE, "3_autoroll_loan_closure.png"), dpi=160)
plt.close(fig)
print("ok")
