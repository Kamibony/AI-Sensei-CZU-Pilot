import { css } from 'https://cdn.jsdelivr.net/gh/lit/dist@3/core/lit-core.min.js';

export const baseStyles = css`
    :root, :host {
        --bg-main: #f5f7fb;
        --bg-card: #ffffff;
        --bg-sidebar: #ffffff;
        --accent: #4f46e5;
        --accent-soft: #eef2ff;
        --accent-green: #22c55e;
        --accent-green-soft: #e5f9ec;
        --text-main: #111827;
        --text-muted: #6b7280;
        --border-soft: #e5e7eb;
        --shadow-card: 0 18px 45px rgba(15, 23, 42, 0.05);
        --radius-lg: 20px;
        --radius-xl: 26px;
        font-family: 'Plus Jakarta Sans', system-ui, -apple-system, sans-serif;
    }

    * {
        box-sizing: border-box;
    }

    /* TYPOGRAPHY & UTILS */
    .text-main { color: var(--text-main); }
    .text-muted { color: var(--text-muted); }

    /* LAYOUTS */
    .main {
        padding: 20px 32px 32px;
        display: flex;
        flex-direction: column;
        gap: 20px;
        background: var(--bg-main);
        min-height: 100%;
    }

    .grid {
        display: grid;
        grid-template-columns: minmax(0, 2fr) minmax(320px, 1.1fr);
        gap: 20px;
        align-items: flex-start;
    }

    /* CARDS */
    .card {
        background: var(--bg-card);
        border-radius: var(--radius-xl);
        box-shadow: var(--shadow-card);
        padding: 18px 20px;
    }

    .card-title {
        font-size: 14px;
        text-transform: uppercase;
        letter-spacing: .12em;
        color: var(--text-muted);
        font-weight: 600;
    }

    .card-subtitle {
        font-size: 12px;
        color: var(--text-muted);
    }

    /* BUTTONS */
    .btn-primary {
        border: none;
        outline: none;
        padding: 10px 20px;
        border-radius: 999px;
        background: linear-gradient(135deg, #4f46e5, #7c3aed);
        color: #fff;
        font-weight: 600;
        font-size: 14px;
        cursor: pointer;
        box-shadow: 0 16px 35px rgba(79, 70, 229, 0.4);
        display: inline-flex;
        align-items: center;
        gap: 8px;
        transition: transform .08s ease, box-shadow .1s ease, filter .1s ease;
        text-decoration: none;
    }
    .btn-primary:hover {
        transform: translateY(-1px);
        filter: brightness(1.03);
        box-shadow: 0 20px 40px rgba(79, 70, 229, 0.5);
    }

    .btn-ghost {
        padding: 8px 14px;
        border-radius: 999px;
        border: 1px solid var(--border-soft);
        background: rgba(255,255,255,0.9);
        font-size: 13px;
        color: var(--text-muted);
        display: inline-flex;
        align-items: center;
        gap: 6px;
        cursor: pointer;
        transition: background .1s ease, border-color .1s ease;
    }
    .btn-ghost:hover {
        background: #f9fafb;
        border-color: #d1d5db;
    }

    /* TOPBAR */
    .topbar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 16px;
        flex-wrap: wrap;
    }
    .topbar-title { font-size: 22px; font-weight: 600; }
    .topbar-sub { font-size: 13px; color: var(--text-muted); }

    .status-pill {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        border-radius: 999px;
        padding: 4px 10px;
        background: #ecfdf5;
        color: #15803d;
        font-size: 11px;
        font-weight: 500;
    }
    .status-dot {
        width: 8px;
        height: 8px;
        border-radius: 999px;
        background: #22c55e;
    }

    /* STATS */
    .management-grid {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 14px;
        margin-top: 12px;
    }
    .stat-card {
        background: #f9fafb;
        border-radius: 18px;
        padding: 12px 12px 14px;
        border: 1px solid #eef0f5;
        display: flex;
        flex-direction: column;
        gap: 6px;
        transition: background .15s ease, transform .08s ease, box-shadow .15s ease;
        cursor: pointer;
    }
    .stat-card:hover {
        background: #ffffff;
        transform: translateY(-2px);
        box-shadow: 0 10px 25px rgba(15,23,42,0.06);
    }
    .stat-top { display: flex; justify-content: space-between; align-items: center; }
    .stat-icon {
        width: 26px; height: 26px; border-radius: 999px; background: #eef2ff;
        display: flex; align-items: center; justify-content: center; font-size: 13px; color: #4f46e5;
    }
    .stat-label { font-size: 11px; text-transform: uppercase; letter-spacing: .12em; color: var(--text-muted); font-weight: 600; }
    .stat-value { font-size: 20px; font-weight: 700; margin-top: 4px; }
    .stat-footer { display: flex; justify-content: space-between; align-items: center; font-size: 11px; color: var(--text-muted); }
    .link-inline { font-size: 11px; font-weight: 500; color: #4f46e5; }

    /* LESSON FLOW */
    .lesson-flow-card {
        background: #ffffff;
        border-radius: 28px;
        box-shadow: var(--shadow-card);
        padding: 18px;
        display: flex;
        flex-direction: column;
        gap: 14px;
    }
    .flow-badge {
        display: inline-flex; align-items: center; gap: 6px; padding: 4px 9px;
        border-radius: 999px; background: #fef3c7; color: #b45309;
        font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: .12em;
    }
    .flow-steps { display: flex; flex-direction: column; gap: 10px; }
    .flow-step {
        display: grid; grid-template-columns: 40px minmax(0,1fr); gap: 10px;
        align-items: center; padding: 10px 12px; border-radius: 16px;
        background: #f9fafb; border: 1px dashed #e5e7eb;
    }
    .flow-step.badge { background: var(--accent-soft); border-color: #c7d2fe; border-style: solid; }
    .flow-step.result { background: var(--accent-green-soft); border-color: #bbf7d0; border-style: solid; }
    .flow-icon {
        width: 32px; height: 32px; border-radius: 999px; display: flex; align-items: center;
        justify-content: center; font-size: 16px; background: #eef2ff; color: #4f46e5;
    }
    .flow-icon.result { background: #dcfce7; color: #15803d; }

    /* RESPONSIVE */
    @media (max-width: 1024px) {
        .management-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    }
    @media (max-width: 860px) {
        .grid { grid-template-columns: minmax(0, 1fr); }
    }
`;
