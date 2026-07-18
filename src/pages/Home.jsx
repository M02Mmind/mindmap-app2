import { useState, useRef, useEffect, useMemo } from "react";
import FlashcardDeck from "@/components/mindmap/FlashcardDeck";
import SearchOverlay from "@/components/mindmap/SearchOverlay";
import {
  STROKE, FILL, isVideoSrc,
  ensureBlocks, makeBlock, SLASH_COMMANDS,
  fileToDataUrl, formatBytes, fileIcon,
  BlockRow, SlashMenu,
} from "@/components/mindmap/blockEditor";

// ─── Design Tokens ────────────────────────────────────────────────────────────
// STROKE, FILL kommen jetzt aus blockEditor.jsx (gemeinsam mit FlashcardDeck.jsx genutzt).
const FILL_DARK = { 'c-purple':'#2E2A4D','c-teal':'#1B3830','c-coral':'#3D2A1F','c-pink':'#3D2530','c-gray':'#33322E' };
const PALETTE = ['c-purple','c-teal','c-coral','c-pink','c-gray'];

// Zentrale Theme-Definition: hell & dunkel
const THEMES = {
  light: {
    bg:'#F7F6F3', surface:'#fff', surface2:'#FBFAF8', border:'#E6E4DF', borderStrong:'#D7D4CC',
    text:'#1F1E1C', textSoft:'#6B6963', accent:'#534AB7', accentFill:'#EFE9FB',
    fill: FILL, nodeText:'#1F1E1C', canvasLine:'#D7D4CC',
  },
  dark: {
    bg:'#17161A', surface:'#1F1E24', surface2:'#242329', border:'#33323A', borderStrong:'#45444C',
    text:'#F2F1ED', textSoft:'#A6A4AC', accent:'#9C93F0', accentFill:'#2E2A4D',
    fill: FILL_DARK, nodeText:'#F2F1ED', canvasLine:'#45444C',
  },
};
let _uid = 100;
const uid = () => 'n' + (_uid++);

// ─── Initialdaten ─────────────────────────────────────────────────────────────
const INIT_MAPS = [{
  id: 'map-mathe', label: 'Mathe', color: 'c-purple', nodeShape: 'circle',
  customPos: {},
  tree: {
    id: 'root', label: 'Mathe', color: 'c-purple',
    definition: 'Überblick über das gesamte Fach Mathematik.', note: '', images: [], videos: [], files: [], children: [
      { id: 'analysis', label: 'Analysis', color: 'c-teal',
        definition: 'Beschäftigt sich mit Veränderung, Grenzwerten und Funktionen.', note: '', images: [], videos: [], files: [], children: [
          { id: 'ableitung', label: 'Ableitungen', color: 'c-teal',
            definition: 'Misst die momentane Änderungsrate einer Funktion.', note: 'Wichtig für Kurvendiskussion.', images: [], videos: [], files: [], children: [] },
          { id: 'integral', label: 'Integrale', color: 'c-teal',
            definition: 'Berechnet Flächen unter Funktionsgraphen.', note: '', images: [], videos: [], files: [], children: [] },
        ]},
      { id: 'algebra', label: 'Algebra', color: 'c-coral',
        definition: 'Rechnen mit Variablen, Gleichungen und Strukturen.', note: '', images: [], videos: [], files: [], children: [
          { id: 'grundrechen', label: 'Plus, Minus, Mal, Geteilt', color: 'c-coral',
            definition: 'Die vier Grundrechenarten.', note: 'Basis für alles andere.', images: [], videos: [], files: [], children: [] },
          { id: 'gleichungen', label: 'Gleichungen', color: 'c-coral',
            definition: 'Bestimmung unbekannter Größen.', note: '', images: [], videos: [], files: [], children: [] },
        ]},
      { id: 'wkeit', label: 'Wahrscheinlichkeit', color: 'c-pink',
        definition: 'Beschäftigt sich mit Zufall und Häufigkeiten.', note: '', images: [], videos: [], files: [], children: [] },
    ]
  }
}];

// ─── Helpers ──────────────────────────────────────────────────────────────────
function findParent(target, root) {
  if (root.children.includes(target)) return root.children;
  for (const c of root.children) { const r = findParent(target, c); if (r) return r; }
  return null;
}
function countLearned(node) {
  let total = 0, learned = 0;
  for (const c of (node.children || [])) {
    total += 1;
    if (c.learned) learned += 1;
    const r = countLearned(c);
    total += r.total; learned += r.learned;
  }
  return { total, learned };
}
// Fortschrittsquote für den Mini-Ring an einem Knoten:
// zählt den Knoten SELBST (ob er als gelernt markiert ist) plus alle Unterknoten zusammen.
// So wirkt sich "Analysis als gelernt markieren" direkt auf den Ring von Analysis aus,
// nicht nur das Markieren seiner Unterknoten (Ableitungen, Integrale).
function branchProgress(node) {
  if (!node.children || node.children.length === 0) return null;
  const { total: childTotal, learned: childLearned } = countLearned(node);
  const total = childTotal + 1;                     // +1 für den Knoten selbst
  const learned = childLearned + (node.learned ? 1 : 0);
  return learned / total;
}
// Alle Knoten mit Pfad (für Suche) sammeln
function collectAllNodes(node, path = []) {
  const here = [...path, node];
  let out = [{ node, path: here }];
  for (const c of (node.children || [])) out = out.concat(collectAllNodes(c, here));
  return out;
}
function computeLayout(node) {
  const cx = 340, cy = 220, radius = 150, n = node.children.length;
  const pos = { [node.id]: { x: cx, y: cy } };
  node.children.forEach((c, i) => {
    const a = (2 * Math.PI * i / n) - Math.PI / 2;
    pos[c.id] = { x: cx + radius * Math.cos(a), y: cy + radius * Math.sin(a) };
  });
  return pos;
}
function getEffectivePos(viewNode, customPos) {
  const layout = computeLayout(viewNode);
  const over   = (customPos || {})[viewNode.id] || {};
  const result = {};
  for (const id in layout) result[id] = over[id] || layout[id];
  return result;
}
function getLines(label, isCtr) {
  const words = label.split(' '), maxLen = isCtr ? 10 : 8, lines = []; let cur = '';
  for (const w of words) {
    const cand = cur ? cur + ' ' + w : w;
    if (cur && cand.length > maxLen) { lines.push(cur); cur = w; } else cur = cand;
  }
  if (cur) lines.push(cur); return lines;
}
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
function rdims(r) { return { w: r * 2.15, h: r * 1.35 }; }
function badgePos(sh, x, y, r) {
  if (sh === 'rect' || sh === 'rounded') { const { w, h } = rdims(r); return { x: x + w/2, y: y - h/2 }; }
  return { x: x + r*0.7, y: y - r*0.7 };
}

// ─── SVG Node ─────────────────────────────────────────────────────────────────
function Shape({ sh, x, y, r, col, ring, theme, dimmed }) {
  const fillMap = theme?.fill || FILL;
  const fill = ring ? 'none' : fillMap[col], stroke = STROKE[col];
  const sw = ring ? 2.5 : 1.5, da = ring ? '4 3' : undefined;
  const pe = ring ? { pointerEvents:'none' } : {};
  const opacity = dimmed ? 0.28 : 1;
  if (sh === 'rect' || sh === 'rounded') {
    const { w, h } = rdims(r), rx = sh === 'rounded' ? Math.min(w,h)*0.18 : 0;
    return <rect {...pe} x={x-w/2} y={y-h/2} width={w} height={h} rx={rx} ry={rx} fill={fill} stroke={stroke} strokeWidth={sw} strokeDasharray={da} opacity={opacity}/>;
  }
  return <circle {...pe} cx={x} cy={y} r={r} fill={fill} stroke={stroke} strokeWidth={sw} strokeDasharray={da} opacity={opacity}/>;
}
function NodeLabel({ label, x, y, isCtr, theme, dimmed }) {
  const ls = getLines(label, isCtr), fs = isCtr ? 13 : 12;
  const sy = y - ((ls.length-1)*(fs+2))/2;
  const color = theme?.nodeText || '#1F1E1C';
  return <>{ls.map((l,i) => (
    <text key={i} x={x} y={sy+i*(fs+2)} textAnchor="middle" dominantBaseline="middle"
      fontSize={fs} fontWeight="500" fill={color} opacity={dimmed?0.35:1} style={{pointerEvents:'none',userSelect:'none'}}>{l}</text>
  ))}</>;
}
// Mini-Fortschrittsanzeige um einen Knoten (zeigt Anteil gelernter Unter-/Eigenknoten).
// Passt sich der aktuellen Knotenform an: Kreis-Ring bei runden Knoten,
// umlaufender Rechteck-Rahmen bei rect/rounded-Knoten.
function ProgressRing({ x, y, r, pct, color, sh }) {
  if (pct === null) return null;

  if (sh === 'rect' || sh === 'rounded') {
    const { w, h } = rdims(r);
    const pad = 7;
    const rw = w + pad * 2, rh = h + pad * 2;
    const rx = sh === 'rounded' ? Math.min(rw, rh) * 0.16 : 0;
    const perim = 2 * (rw + rh) - 8 * rx + 2 * Math.PI * rx; // grober Umfang inkl. abgerundeter Ecken
    return (
      <g style={{pointerEvents:'none'}}>
        <rect x={x-rw/2} y={y-rh/2} width={rw} height={rh} rx={rx} ry={rx}
          fill="none" stroke={color} strokeOpacity={0.18} strokeWidth={3}/>
        <rect x={x-rw/2} y={y-rh/2} width={rw} height={rh} rx={rx} ry={rx}
          fill="none" stroke={color} strokeWidth={3}
          strokeDasharray={perim} strokeDashoffset={perim*(1-pct)} strokeLinecap="round"/>
      </g>
    );
  }

  const ringR = r + 7, circ = 2 * Math.PI * ringR;
  return (
    <g style={{pointerEvents:'none'}}>
      <circle cx={x} cy={y} r={ringR} fill="none" stroke={color} strokeOpacity={0.18} strokeWidth={3}/>
      <circle cx={x} cy={y} r={ringR} fill="none" stroke={color} strokeWidth={3}
        strokeDasharray={circ} strokeDashoffset={circ*(1-pct)}
        strokeLinecap="round" transform={`rotate(-90 ${x} ${y})`}/>
    </g>
  );
}

// ─── Lightbox (Bilder & Videos) ───────────────────────────────────────────────
function Lightbox({ src, onClose }) {
  const video = isVideoSrc(src);
  useEffect(() => {
    const fn = e => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', fn);
    return () => window.removeEventListener('keydown', fn);
  }, [onClose]);
  return (
    <div onClick={onClose} style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.85)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:3000,padding:24,cursor:'zoom-out'}}>
      {video ? (
        <video src={src} controls autoPlay onClick={e=>e.stopPropagation()} style={{maxWidth:'88vw',maxHeight:'82vh',borderRadius:10,boxShadow:'0 8px 40px rgba(0,0,0,.5)',cursor:'default',background:'#000'}}/>
      ) : (
        <img src={src} alt="" onClick={e=>e.stopPropagation()} style={{maxWidth:'88vw',maxHeight:'82vh',borderRadius:10,boxShadow:'0 8px 40px rgba(0,0,0,.5)',cursor:'default'}}/>
      )}
      <button onClick={onClose} style={{position:'absolute',top:16,right:16,background:'rgba(255,255,255,.15)',border:'none',color:'#fff',borderRadius:'50%',width:36,height:36,fontSize:18,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center'}}>✕</button>
    </div>
  );
}

// Einzelner animierter Knoten: pop-in beim ersten Erscheinen (neu hinzugefügt),
// sanftes Hover-Wachsen, leichte "Landung" nach dem Loslassen beim Verschieben.
function AnimatedNodeGroup({ node, p, isCtr, sh, r, theme, dimmed, selected, bProg, hc, bp, onPointerDown, isBeingDragged }) {
  const isNew = useRef(!node._seen);
  useEffect(() => { node._seen = true; }, [node]);
  const [mountScale, setMountScale] = useState(isNew.current ? 0.15 : 1);
  const [hovered, setHovered] = useState(false);

  useEffect(() => {
    if (!isNew.current) return;
    // Sanftes Bounce-In: übersteuert kurz über 1.0 und pendelt sich ein
    let raf;
    const start = performance.now();
    const dur = 420;
    const bounce = t => {
      // leichtes Overshoot-Easing (elastisch)
      const c4 = (2*Math.PI)/3;
      return t === 0 ? 0 : t === 1 ? 1 : Math.pow(2,-8*t)*Math.sin((t*8-0.75)*c4)+1;
    };
    const step = now => {
      const t = Math.min(1, (now-start)/dur);
      setMountScale(0.15 + bounce(t)*0.85);
      if (t < 1) raf = requestAnimationFrame(step);
      else setMountScale(1);
    };
    raf = requestAnimationFrame(step);
    return () => raf && cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const hoverScale = hovered && !isBeingDragged ? 1.055 : 1;
  const finalScale = mountScale * hoverScale;

  return (
    <g
      style={{cursor:'pointer', transformOrigin:`${p.x}px ${p.y}px`, transform:`scale(${finalScale})`, transition: hovered ? 'transform .18s cubic-bezier(.34,1.56,.64,1)' : (isBeingDragged ? 'none' : 'transform .25s cubic-bezier(.34,1.56,.64,1)')}}
      onPointerDown={onPointerDown}
      onPointerEnter={()=>setHovered(true)}
      onPointerLeave={()=>setHovered(false)}
    >
      {selected && <Shape sh={sh} x={p.x} y={p.y} r={r+5} col={node.color} ring theme={theme}/>}
      {bProg !== null && !isCtr && <ProgressRing x={p.x} y={p.y} r={r} pct={bProg} color={STROKE[node.color]} sh={sh}/>}
      <Shape sh={sh} x={p.x} y={p.y} r={r} col={node.color} theme={theme} dimmed={dimmed}/>
      <NodeLabel label={node.label} x={p.x} y={p.y} isCtr={isCtr} theme={theme} dimmed={dimmed}/>
      {node.learned&&<>
        <circle cx={p.x+r*0.65} cy={p.y+r*0.65} r={8} fill="#0F6E56" stroke={theme?.surface2 || '#FBFAF8'} strokeWidth={1.5} opacity={dimmed?0.4:1}/>
        <text x={p.x+r*0.65} y={p.y+r*0.65+3} textAnchor="middle" fontSize={10} fontWeight="bold" fill="#fff" opacity={dimmed?0.4:1} style={{pointerEvents:'none',userSelect:'none'}}>✓</text>
      </>}
      {!isCtr&&hc&&<>
        <circle cx={bp.x} cy={bp.y} r={9} fill={theme?.surface2 || '#FBFAF8'} stroke={STROKE[node.color]} strokeWidth={1} opacity={dimmed?0.4:1}/>
        <text x={bp.x} y={bp.y+4} textAnchor="middle" fontSize={12} fill={STROKE[node.color]} opacity={dimmed?0.4:1} style={{pointerEvents:'none',userSelect:'none'}}>+</text>
      </>}
    </g>
  );
}

// ─── Canvas ───────────────────────────────────────────────────────────────────
function Canvas({ cur, pathLen, amap, onNav, onDetail, onMoveNode, selectedIdx, theme, hideLearned }) {
  const svgRef  = useRef(null);
  const panRef  = useRef({ x:0, y:0 });
  const zoomRef = useRef(1);
  const [, tick] = useState(0);
  const redraw = () => tick(v => v+1);
  const inter  = useRef(null);
  const pointers = useRef(new Map());
  const pinch = useRef(null);
  const animRef = useRef(null);
  const [draggedNodeId, setDraggedNodeId] = useState(null);

  useEffect(() => { if(animRef.current) cancelAnimationFrame(animRef.current); panRef.current={x:0,y:0}; zoomRef.current=1; redraw(); }, [cur.id]);

  useEffect(() => {
    const el = svgRef.current; if (!el) return;
    const onWheel = e => {
      e.preventDefault();
      const rc = el.getBoundingClientRect();
      const sx = (e.clientX-rc.left)*(680/rc.width), sy = (e.clientY-rc.top)*(440/rc.height);
      const f = e.deltaY < 0 ? 1.12 : 1/1.12;
      const nz = clamp(zoomRef.current*f, 0.2, 5);
      const wx = (sx-panRef.current.x)/zoomRef.current, wy = (sy-panRef.current.y)/zoomRef.current;
      panRef.current = { x: sx-wx*nz, y: sy-wy*nz };
      zoomRef.current = nz; redraw();
    };
    el.addEventListener('wheel', onWheel, {passive:false});
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  const toSvg   = (cx,cy) => { const rc=svgRef.current.getBoundingClientRect(); return {x:(cx-rc.left)*(680/rc.width),y:(cy-rc.top)*(440/rc.height)}; };
  const toWorld = (sx,sy) => ({ x:(sx-panRef.current.x)/zoomRef.current, y:(sy-panRef.current.y)/zoomRef.current });

  const resetView = () => {
    const centerPos = (getEffectivePos(cur, amap.customPos))[cur.id] || { x: 340, y: 220 };
    const zoom = 1;
    panRef.current  = { x: 340 - centerPos.x * zoom, y: 220 - centerPos.y * zoom };
    zoomRef.current = zoom;
    redraw();
  };

  const zoomInto = (p, done) => {
    if (animRef.current) cancelAnimationFrame(animRef.current);
    const tz = 3.6, tx = 340 - p.x * tz, ty = 220 - p.y * tz;
    const sx = panRef.current.x, sy = panRef.current.y, sz = zoomRef.current;
    const dur = 380, start = performance.now();
    const ease = t => t<0.5 ? 2*t*t : 1-Math.pow(-2*t+2,2)/2;
    const step = now => {
      const t = Math.min(1, (now-start)/dur), e = ease(t);
      panRef.current = { x: sx+(tx-sx)*e, y: sy+(ty-sy)*e };
      zoomRef.current = sz+(tz-sz)*e;
      redraw();
      if (t < 1) animRef.current = requestAnimationFrame(step);
      else { panRef.current={x:0,y:0}; zoomRef.current=1; done && done(); }
    };
    animRef.current = requestAnimationFrame(step);
  };

  const pos = getEffectivePos(cur, amap.customPos);
  const sh  = amap.nodeShape || 'circle';
  const {x:px,y:py} = panRef.current, z = zoomRef.current;

  const nodeItems = [
    {node:cur, p:pos[cur.id]||{x:340,y:220}, isCtr:true},
    ...cur.children.map(c => ({node:c, p:pos[c.id]||{x:340,y:220}, isCtr:false})),
  ];

  const onBgPD = e => {
    svgRef.current.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, {x:e.clientX, y:e.clientY});
    if (pointers.current.size === 2) {
      const [a,b] = [...pointers.current.values()];
      pinch.current = { dist: Math.hypot(b.x-a.x, b.y-a.y), zoom: zoomRef.current, cx:(a.x+b.x)/2, cy:(a.y+b.y)/2 };
      inter.current = null;
    } else {
      inter.current = {type:'pan', lx:e.clientX, ly:e.clientY};
    }
  };
  const onNodePD = (e,node,p,isCtr) => {
    e.stopPropagation(); svgRef.current.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, {x:e.clientX, y:e.clientY});
    const sv=toSvg(e.clientX,e.clientY), wv=toWorld(sv.x,sv.y);
    inter.current={type:'node',node,isCtr,nx0:p.x,ny0:p.y,wx0:wv.x,wy0:wv.y,moved:false};
  };  const onPM = e => {
    if (pointers.current.has(e.pointerId)) pointers.current.set(e.pointerId, {x:e.clientX, y:e.clientY});
    if (pointers.current.size === 2 && pinch.current) {
      const [a,b] = [...pointers.current.values()];
      const dist = Math.hypot(b.x-a.x, b.y-a.y);
      const rc = svgRef.current.getBoundingClientRect();
      const sx = (pinch.current.cx-rc.left)*(680/rc.width), sy = (pinch.current.cy-rc.top)*(440/rc.height);
      const nz = clamp(pinch.current.zoom*(dist/pinch.current.dist), 0.2, 5);
      const wx = (sx-panRef.current.x)/pinch.current.zoom, wy = (sy-panRef.current.y)/pinch.current.zoom;
      panRef.current = { x: sx-wx*nz, y: sy-wy*nz };
      zoomRef.current = nz; redraw();
      return;
    }
    const it=inter.current; if(!it) return;
    if (it.type==='pan') {
      const rc=svgRef.current.getBoundingClientRect();
      panRef.current={x:panRef.current.x+(e.clientX-it.lx)*(680/rc.width), y:panRef.current.y+(e.clientY-it.ly)*(440/rc.height)};
      it.lx=e.clientX; it.ly=e.clientY; redraw();
    } else if (it.type==='node') {
      const sv=toSvg(e.clientX,e.clientY), wv=toWorld(sv.x,sv.y);
      const dx=wv.x-it.wx0, dy=wv.y-it.wy0;
      if (!it.moved&&(Math.abs(dx)>3||Math.abs(dy)>3)) { it.moved=true; setDraggedNodeId(it.node.id); }
      if (it.moved) onMoveNode(cur.id, it.node.id, {x:it.nx0+dx, y:it.ny0+dy});
    }
  };
  const onPU = e => {
    if (draggedNodeId) setDraggedNodeId(null);
    if (pointers.current.has(e.pointerId)) pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
    if (pointers.current.size === 1 && !inter.current) {
      const [rem] = [...pointers.current.values()];
      inter.current = {type:'pan', lx:rem.x, ly:rem.y};
      return;
    }
    if (pointers.current.size > 0) { inter.current = null; return; }
    const cancelled = e && e.type === 'pointercancel';
    const it=inter.current; inter.current=null;
    if (cancelled || !it||it.type!=='node'||it.moved) return;
    if (it.isCtr&&pathLen>1) { onDetail(it.node); return; }
    if (!it.isCtr) { if (it.node.children?.length>0) zoomInto({x:it.nx0,y:it.ny0}, ()=>onNav(it.node)); else onDetail(it.node); }
  };

  return (
    <div style={{position:'relative',width:'100%',height:'100%'}}>
      <svg ref={svgRef} viewBox="0 0 680 440"
        style={{width:'100%',height:'100%',display:'block',cursor:'grab',touchAction:'none'}}
        onPointerDown={onBgPD} onPointerMove={onPM} onPointerUp={onPU} onPointerCancel={onPU}>
        <g transform={`translate(${px},${py}) scale(${z})`}>
          {nodeItems.slice(1).map(({p},i) => (
            <line key={i} x1={nodeItems[0].p.x} y1={nodeItems[0].p.y} x2={p.x} y2={p.y} stroke={theme?.canvasLine || '#D7D4CC'} strokeWidth={1.5}/>
          ))}
          {nodeItems.map(({node,p,isCtr}, i) => {
            const r=isCtr?56:44, bp=badgePos(sh,p.x,p.y,r), hc=node.children?.length>0;
            const childIdx = isCtr ? -1 : i - 1;
            const selected = !isCtr && childIdx === selectedIdx;
            const dimmed = hideLearned && !isCtr && !!node.learned;
            const bProg = hc ? branchProgress(node) : null;
            const isBeingDragged = draggedNodeId === node.id;
            return (
              <AnimatedNodeGroup key={node.id}
                node={node} p={p} isCtr={isCtr} sh={sh} r={r} theme={theme}
                dimmed={dimmed} selected={selected} bProg={bProg} hc={hc} bp={bp}
                isBeingDragged={isBeingDragged}
                onPointerDown={e=>onNodePD(e,node,p,isCtr)}
              />
            );
          })}
        </g>
      </svg>
      <button onClick={resetView} style={{position:'absolute',bottom:10,right:10,fontFamily:'inherit',fontSize:12,background:theme?.surface2||'rgba(255,255,255,0.92)',color:theme?.text||'#1F1E1C',border:'0.5px solid '+(theme?.borderStrong||'#D7D4CC'),borderRadius:8,height:28,cursor:'pointer',padding:'0 10px',boxShadow:'0 1px 4px rgba(0,0,0,.1)'}}>
        ⌖ Zentrieren
      </button>
    </div>
  );
}

// ─── Detail Panel (rechte Seitenleiste) ───────────────────────────────────────
// Block-Editor-Datenmodell & Helfer (ensureBlocks, makeBlock, SLASH_COMMANDS, BlockRow, SlashMenu, ...)
// kommen jetzt aus @/components/mindmap/blockEditor - gemeinsam mit FlashcardDeck.jsx genutzt,
// damit beide Stellen exakt dasselbe Format lesen/schreiben.

// ─── Konfetti-Burst: kleiner Erfolgsmoment beim Markieren als "Gelernt" ───────
function ConfettiBurst() {
  const colors = ['#0F6E56','#534AB7','#993C1D','#993556','#E0A830'];
  const particles = Array.from({length:14}, (_,i) => {
    const angle = (Math.PI*2*i/14) + (Math.random()*0.4-0.2);
    const dist = 34 + Math.random()*26;
    return {
      id:i,
      tx: Math.cos(angle)*dist,
      ty: Math.sin(angle)*dist - 10,
      color: colors[i % colors.length],
      delay: Math.random()*60,
      size: 4 + Math.random()*3,
    };
  });
  return (
    <div style={{position:'absolute', left:'50%', top:'50%', width:0, height:0, pointerEvents:'none'}}>
      {particles.map(p => (
        <span key={p.id} style={{
          position:'absolute', left:0, top:0, width:p.size, height:p.size,
          borderRadius: p.id % 3 === 0 ? 2 : '50%',
          background:p.color,
          animation:`confettiFly .75s ease-out ${p.delay}ms both`,
          '--tx': p.tx+'px', '--ty': p.ty+'px',
        }}/>
      ))}
      <style>{`@keyframes confettiFly{0%{transform:translate(0,0) scale(0.4);opacity:1;}100%{transform:translate(var(--tx),var(--ty)) scale(1);opacity:0;}}`}</style>
    </div>
  );
}

// ─── DetailPanel: Notion-artiger Block-Editor ────────────────────────────────
function DetailPanel({ node, onClose, onDelete, onAddChild, isRoot, rr, theme, onExpand, isExpanded, fullBleed }) {
  const blocks = ensureBlocks(node);
  const [, forceTick] = useState(0);
  const forceRender = () => forceTick(t=>t+1);

  const [showNC, setShowNC] = useState(false);
  const [ncV, setNcV] = useState('');
  const [tagV, setTagV] = useState('');
  const [slashOpenFor, setSlashOpenFor] = useState(null); // Block-ID, für den das Slash-Menü offen ist
  const [focusBlockId, setFocusBlockId] = useState(null);
  const [justSaved, setJustSaved] = useState(false);
  const saveTimerRef = useRef(null);

  const accentColor = STROKE[node.color] || '#534AB7';

  const updateBlock = (id, newBlock) => {
    const idx = blocks.findIndex(b=>b.id===id);
    if (idx===-1) return;
    blocks[idx] = newBlock;
    node.blocks = [...blocks];
    rr();
  };
  const removeBlock = id => {
    node.blocks = blocks.filter(b=>b.id!==id);
    if (node.blocks.length === 0) node.blocks = [makeBlock('text')];
    rr();
  };
  const insertBlockAfter = (id, newBlock) => {
    const idx = blocks.findIndex(b=>b.id===id);
    const copy = [...blocks];
    copy.splice(idx+1, 0, newBlock);
    node.blocks = copy;
    setFocusBlockId(newBlock.id);
    rr();
  };
  const replaceBlockType = (id, cmd) => {
    const idx = blocks.findIndex(b=>b.id===id);
    if (idx===-1) return;
    const fresh = cmd.make();
    fresh.id = blocks[idx].id; // Position/Identität beibehalten
    const copy = [...blocks];
    copy[idx] = fresh;
    node.blocks = copy;
    setSlashOpenFor(null);
    setFocusBlockId(fresh.id);
    rr();
  };
  const handleEnter = (id) => {
    const blk = blocks.find(b=>b.id===id);
    const newType = (blk && (blk.type === 'bullet' || blk.type === 'numbered')) ? blk.type : 'text';
    insertBlockAfter(id, makeBlock(newType));
  };
  const handleBackspaceEmpty = (id) => {
    const idx = blocks.findIndex(b=>b.id===id);
    if (idx <= 0) return; // ersten Block nicht per Backspace löschen
    removeBlock(id);
    setFocusBlockId(blocks[idx-1]?.id || null);
  };

  const addTag = () => {
    const t = tagV.trim(); if (!t) return;
    if (!node.tags) node.tags = [];
    if (!node.tags.includes(t)) node.tags.push(t);
    setTagV(''); rr();
  };
  const removeTag = t => { node.tags = (node.tags||[]).filter(x=>x!==t); rr(); };
  const toggleLearned = () => {
    const becomingLearned = !node.learned;
    node.learned = !node.learned;
    rr();
    if (becomingLearned) triggerConfetti();
  };
  const [confettiKey, setConfettiKey] = useState(0);
  const [showConfetti, setShowConfetti] = useState(false);
  const confettiTimerRef = useRef(null);
  const triggerConfetti = () => {
    setConfettiKey(k=>k+1);
    setShowConfetti(true);
    if (confettiTimerRef.current) clearTimeout(confettiTimerRef.current);
    confettiTimerRef.current = setTimeout(()=>setShowConfetti(false), 900);
  };
  useEffect(() => () => { if (confettiTimerRef.current) clearTimeout(confettiTimerRef.current); }, []);

  const confirmChild = () => {
    const label = ncV.trim(); if (!label) return;
    onAddChild(node, label);
    setShowNC(false); setNcV('');
  };

  // Expliziter Speichern-Button: obwohl der Editor autosave betreibt (jede Änderung
  // wird sofort in node.blocks übernommen), gibt dieser Button spürbares Feedback,
  // dass der aktuelle Stand gesichert ist - inkl. kurzer Bestätigungs-Animation.
  const handleSave = () => {
    rr();
    setJustSaved(true);
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => setJustSaved(false), 1400);
  };
  useEffect(() => () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); }, []);

  const S_BTN = {
    fontFamily:'inherit', fontSize:12, background:theme?.surface2||'#FBFAF8', color:theme?.text||'#1F1E1C',
    border:'0.5px solid '+(theme?.borderStrong||'#D7D4CC'), borderRadius:7, height:30, cursor:'pointer', padding:'0 10px',
  };

  return (
    <div style={{
      width:'100%', height:'100%',
      background: theme?.surface || '#fff',
      display:'flex', flexDirection:'column',
      overflow:'hidden',
    }}>
      {/* Header */}
      <div style={{padding: fullBleed ? '18px 5vw 0' : '14px 16px 0', flexShrink:0}}>
        <div style={{display:'flex', alignItems:'center', justifyContent:'flex-end', gap:6, marginBottom:8}}>
          {onExpand && (
            <button onClick={onExpand} title={isExpanded ? 'Als Seitenpanel anzeigen' : 'Als eigenes Fenster öffnen'}
              style={{...S_BTN, width:28, height:28, padding:0, fontSize:13}}>
              {isExpanded ? '⤡' : '⤢'}
            </button>
          )}
          <button onClick={onClose} style={{...S_BTN, width:28, height:28, padding:0, fontSize:13}}>✕</button>
        </div>
      </div>

      {/* Scrollbarer Inhalt: großzügiger Titel + freier Block-Editor, Notion-artig */}
      <div style={{flex:1, overflowY:'auto', padding: fullBleed ? '0 5vw 100px' : '0 16px 40px', display:'flex', justifyContent:'center'}}>
        <div style={{width:'100%', maxWidth: fullBleed ? 760 : 'none'}}>

          {/* Große Titelzeile mit Farbpunkt als "Icon" */}
          <div style={{display:'flex', alignItems:'center', gap:12, marginBottom:6}}>
            <span style={{width:14,height:14,borderRadius:'50%',background:accentColor,flexShrink:0}}/>
            <div style={{fontSize: fullBleed ? 32 : 22, fontWeight:700, color:theme?.text||'#1F1E1C', lineHeight:1.2}}>{node.label}</div>
          </div>

          {/* Lernstatus als dezenter Toggle direkt unter dem Titel */}
          <div style={{position:'relative', display:'inline-block', marginBottom:20}}>
            <div onClick={toggleLearned}
              style={{display:'inline-flex', alignItems:'center', gap:8, padding:'5px 10px 5px 6px', borderRadius:99, cursor:'pointer',
                background: node.learned ? '#E3F3EE' : (theme?.surface2 || '#F4F3F0'),
                border:'0.5px solid '+(node.learned ? '#BFE0D0' : (theme?.border||'#E6E4DF'))}}>
              <span style={{width:30, height:17, borderRadius:99, background:node.learned?'#0F6E56':'#D7D4CC', position:'relative', flexShrink:0, transition:'background .15s'}}>
                <span style={{position:'absolute', top:2, left:node.learned?15:2, width:13, height:13, borderRadius:'50%', background:'#fff', transition:'left .15s cubic-bezier(.34,1.56,.64,1)'}}/>
              </span>
              <span style={{fontSize:12.5, fontWeight:500, color:node.learned?'#0F6E56':(theme?.textSoft||'#6B6963')}}>{node.learned?'Gelernt':'Noch offen'}</span>
            </div>
            {showConfetti && <ConfettiBurst key={confettiKey}/>}
          </div>

          {/* Tags direkt unter dem Titelbereich, kompakt */}
          <div style={{display:'flex', flexWrap:'wrap', alignItems:'center', gap:6, marginBottom:24}}>
            {(node.tags||[]).map(t => (
              <span key={t} className="tag-chip" style={{display:'inline-flex', alignItems:'center', gap:5, fontSize:12, padding:'3px 8px 3px 10px', borderRadius:99, background:accentColor+'1A', color:accentColor, border:'0.5px solid '+accentColor+'55'}}>
                {t}
                <span onClick={()=>removeTag(t)} style={{cursor:'pointer', opacity:.7, fontSize:11}}>✕</span>
              </span>
            ))}
            <input value={tagV} onChange={e=>setTagV(e.target.value)}
              placeholder="+ Tag"
              onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();addTag();}}}
              style={{fontFamily:'inherit',fontSize:12,padding:'3px 8px',border:'none',background:'transparent',color:theme?.textSoft||'#9B9994',width:70,outline:'none'}}/>
          </div>

          {/* Block-Editor: freier Inhalt, per Slash-Command erweiterbar */}
          <div style={{display:'flex', flexDirection:'column', gap:2, marginBottom:28}}>
            {blocks.map((block, i) => {
              let listNumber = null;
              if (block.type === 'numbered') {
                let n = 1;
                for (let j = i - 1; j >= 0 && blocks[j].type === 'numbered'; j--) n++;
                listNumber = n;
              }
              return (
              <div key={block.id}>
                <BlockRow
                  block={block}
                  theme={theme}
                  accentColor={accentColor}
                  listNumber={listNumber}
                  autoFocus={focusBlockId===block.id}
                  onChange={nb=>updateBlock(block.id, nb)}
                  onRemove={()=>removeBlock(block.id)}
                  onEnter={()=>handleEnter(block.id)}
                  onBackspaceEmpty={()=>handleBackspaceEmpty(block.id)}
                  onSlash={open=>setSlashOpenFor(open ? block.id : (slashOpenFor===block.id ? null : slashOpenFor))}
                />
                {slashOpenFor === block.id && (
                  <SlashMenu theme={theme}
                    onClose={()=>setSlashOpenFor(null)}
                    onPick={cmd=>{
                      // Das abschließende "/" aus dem Textinhalt entfernen, dann Blocktyp ersetzen
                      updateBlock(block.id, { ...block, content: block.content.slice(0,-1) });
                      replaceBlockType(block.id, cmd);
                    }}/>
                )}
              </div>
              );
            })}
            <button onClick={()=>insertBlockAfter(blocks[blocks.length-1].id, makeBlock('text'))}
              style={{alignSelf:'flex-start', background:'transparent', border:'none', color:theme?.textSoft||'#9B9994', fontSize:13, cursor:'pointer', padding:'6px 0', display:'flex', alignItems:'center', gap:6}}>
              ＋ Block hinzufügen
            </button>
          </div>

          {/* Unterzweig hinzufügen */}
          <div style={{borderTop:'0.5px solid '+(theme?.border||'#E6E4DF'), paddingTop:16, marginBottom:20}}>
            {showNC ? (
              <div style={{display:'flex', gap:6, flexDirection:'column', maxWidth:340}}>
                <input value={ncV} onChange={e=>setNcV(e.target.value)} autoFocus
                  placeholder="Name des Unterzweigs..."
                  onKeyDown={e=>{if(e.key==='Enter')confirmChild();if(e.key==='Escape')setShowNC(false);}}
                  style={{fontFamily:'inherit',fontSize:13,padding:'0 10px',height:32,border:'0.5px solid '+(theme?.borderStrong||'#D7D4CC'),borderRadius:7,background:theme?.surface||'#fff',color:theme?.text||'#1F1E1C',width:'100%',boxSizing:'border-box'}}/>
                <div style={{display:'flex',gap:6}}>
                  <button style={{...S_BTN,flex:1}} onClick={confirmChild}>✓ Hinzufügen</button>
                  <button style={S_BTN} onClick={()=>setShowNC(false)}>✕</button>
                </div>
              </div>
            ) : (
              <button style={S_BTN} onClick={()=>setShowNC(true)}>＋ Unterzweig hinzufügen</button>
            )}
          </div>

        </div>
      </div>

      {/* Footer */}
      <div style={{padding: fullBleed ? '12px 5vw' : '10px 16px', borderTop:'0.5px solid '+(theme?.border||'#E6E4DF'), display:'flex', gap:6, flexShrink:0, justifyContent: fullBleed ? 'center' : 'flex-start'}}>
        <div style={{width:'100%', maxWidth: fullBleed ? 760 : 'none', display:'flex', gap:6, alignItems:'center'}}>
          <button onClick={handleSave}
            className={justSaved ? 'save-pulse' : ''}
            style={{...S_BTN, background: justSaved ? '#0F6E56' : accentColor, color:'#fff', borderColor: justSaved ? '#0F6E56' : accentColor, display:'flex', alignItems:'center', gap:6, transition:'background .25s, border-color .25s'}}>
            <span style={{display:'inline-block', transition:'transform .3s cubic-bezier(.34,1.56,.64,1)', transform: justSaved ? 'scale(1.15)' : 'scale(1)'}}>
              {justSaved ? '✓' : '💾'}
            </span>
            {justSaved ? 'Gespeichert' : 'Speichern'}
          </button>
          {!isRoot && (
            <button onClick={onDelete} style={{...S_BTN, color:'#993556', borderColor:'#E8C3CF'}}>🗑 Knoten löschen</button>
          )}
        </div>
      </div>
    </div>
  );
}

function FocusView({ tree, activeNode, onSelect, onClose, isRoot, rr, onDelete, onAddChild, theme }) {
  const allNodes = useMemo(() => collectAllNodes(tree), [tree]);

  useEffect(() => {
    const fn = e => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', fn);
    return () => window.removeEventListener('keydown', fn);
  }, [onClose]);

  const S_BTN = {
    fontFamily:'inherit', fontSize:12, background:theme?.surface2||'#FBFAF8', color:theme?.text||'#1F1E1C',
    border:'0.5px solid '+(theme?.borderStrong||'#D7D4CC'), borderRadius:7, height:30, cursor:'pointer', padding:'0 10px',
  };

  return (
    <div style={{
      position:'fixed', inset:0, zIndex:2000,
      background:theme?.bg || '#F7F6F3',
      display:'flex', flexDirection:'column',
    }}>
      {/* Top bar */}
      <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', padding:'14px 20px', background:theme?.surface||'#fff', borderBottom:'0.5px solid '+(theme?.border||'#E6E4DF'), flexShrink:0}}>
        <div style={{display:'flex', alignItems:'center', gap:10}}>
          <span style={{fontSize:18}}>📖</span>
          <div style={{fontSize:15, fontWeight:600, color:theme?.text||'#1F1E1C'}}>{tree.label} · Themenübersicht</div>
        </div>
        <button onClick={onClose} style={{...S_BTN, width:36, height:36, padding:0, fontSize:16}}>✕</button>
      </div>

      {/* Hauptbereich: links Knotenliste, rechts Detail */}
      <div style={{flex:1, display:'flex', minHeight:0}}>
        {/* Linke Knotenliste */}
        <div style={{
          width:260, flexShrink:0, overflowY:'auto',
          borderRight:'0.5px solid '+(theme?.border||'#E6E4DF'),
          background:theme?.surface||'#fff', padding:'10px 0',
        }}>
          {allNodes.map(({node, path}) => {
            const depth = path.length - 1;
            const active = node.id === activeNode.id;
            return (
              <div key={node.id} onClick={()=>onSelect(node)}
                style={{
                  display:'flex', alignItems:'center', gap:8,
                  padding:'7px 14px 7px '+(14+depth*16)+'px',
                  cursor:'pointer',
                  background: active ? (theme?.accentFill||'#EFE9FB') : 'transparent',
                  borderLeft: active ? '3px solid '+(theme?.accent||'#534AB7') : '3px solid transparent',
                }}
                onMouseEnter={e=>{ if(!active) e.currentTarget.style.background = theme?.surface2 || '#FBFAF8'; }}
                onMouseLeave={e=>{ if(!active) e.currentTarget.style.background = 'transparent'; }}
              >
                <span style={{width:7,height:7,borderRadius:'50%',background:STROKE[node.color],flexShrink:0}}/>
                <span style={{fontSize:13, fontWeight:active?600:400, color:theme?.text||'#1F1E1C', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', flex:1}}>{node.label}</span>
                {node.learned && <span style={{fontSize:11, color:'#0F6E56', flexShrink:0}}>✓</span>}
              </div>
            );
          })}
        </div>

        {/* Rechts: vollständiges Detail-Panel für den aktiven Knoten - nutzt die volle verfügbare Breite/Höhe */}
        <div style={{flex:1, minWidth:0, display:'flex', minHeight:0}}>
          <DetailPanel
            key={activeNode.id}
            node={activeNode}
            isRoot={isRoot(activeNode)}
            rr={rr}
            onClose={onClose}
            onDelete={onDelete}
            onAddChild={onAddChild}
            theme={theme}
            fullBleed
          />
        </div>
      </div>
    </div>
  );
}

// ─── Canvas + Detail nebeneinander mit ziehbarem Trenner ─────────────────────
function CanvasDetailLayout({ cur, path, amap, detail, isRoot, navigateInto, openDetail, moveNode, setDetail, setDelNode, addChild, rr, selectedIdx, theme, hideLearned }) {
  const [panelWidth, setPanelWidth] = useState(280);
  const [expanded, setExpanded] = useState(false); // Detail-Panel als eigenes Vollbild-Fenster statt Seitenleiste
  const dragging = useRef(false);
  const containerRef = useRef(null);

  // expanded nur zurücksetzen, wenn das Detail-Panel komplett geschlossen wurde (detail === null),
  // nicht bei einem bloßen Wechsel zwischen Knoten (sonst bricht der Vollbild-Modus beim Knotenwechsel ab).
  useEffect(() => { if (!detail) setExpanded(false); }, [detail]);

  const onResizerPD = e => {
    e.preventDefault();
    dragging.current = true;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const onMove = ev => {
      if (!dragging.current || !containerRef.current) return;
      const rc = containerRef.current.getBoundingClientRect();
      const newWidth = Math.max(200, Math.min(520, rc.right - ev.clientX));
      setPanelWidth(newWidth);
    };
    const onUp = () => {
      dragging.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  return (
    <div ref={containerRef} style={{
      display:'flex', flex:1, minHeight:0,
      overflow:'hidden', background:theme?.surface || '#fff',
      position:'relative',
    }}>
      <div style={{flex:1, minWidth:0, position:'relative'}}>
        <Canvas cur={cur} pathLen={path.length} amap={amap}
          onNav={navigateInto} onDetail={openDetail} onMoveNode={moveNode}
          selectedIdx={selectedIdx} theme={theme} hideLearned={hideLearned}/>
      </div>

      {detail && !expanded && (
        <div
          onPointerDown={onResizerPD}
          style={{
            width:5, flexShrink:0, cursor:'col-resize',
            background:'transparent',
            borderLeft:'0.5px solid '+(theme?.border || '#E6E4DF'),
            position:'relative',
            transition:'background .15s',
          }}
          onMouseEnter={e=>e.currentTarget.style.background=theme?.accentFill || '#EFE9FB'}
          onMouseLeave={e=>e.currentTarget.style.background='transparent'}
        >
          <div style={{
            position:'absolute', top:'50%', left:'50%',
            transform:'translate(-50%,-50%)',
            width:3, height:32, borderRadius:99,
            background:theme?.borderStrong || '#D7D4CC',
          }}/>
        </div>
      )}

      {detail && !expanded && (
        <div style={{width:panelWidth, flexShrink:0, overflow:'hidden', display:'flex'}}>
          <DetailPanel
            key={detail.id}
            node={detail}
            isRoot={isRoot(detail)}
            rr={rr}
            onClose={()=>setDetail(null)}
            onDelete={()=>setDelNode(detail)}
            onAddChild={addChild}
            theme={theme}
            onExpand={()=>setExpanded(true)}
            isExpanded={false}
          />
        </div>
      )}

      {/* Vollbild-Fokus-Ansicht: eigenes Fenster über der ganzen App, mit Knotenliste links (wie bei den Lernkarten) */}
      {detail && expanded && (
        <FocusView
          tree={amap.tree}
          activeNode={detail}
          onSelect={n => openDetail(n)}
          onClose={()=>{ setExpanded(false); }}
          onExitToPanel={()=>setExpanded(false)}
          isRoot={isRoot}
          rr={rr}
          onDelete={()=>setDelNode(detail)}
          onAddChild={addChild}
          theme={theme}
        />
      )}
    </div>
  );
}

// Markiert rekursiv alle Knoten eines Baums als "bereits gesehen" - verhindert,
// dass die initialen Beispielknoten (Mathe, Analysis, ...) beim ersten Laden
// der App unnötig die Pop-in-Animation abspielen (die ist nur für NEU hinzugefügte Knoten gedacht).
function markAllSeen(node) {
  node._seen = true;
  (node.children || []).forEach(markAllSeen);
}

// ─── Haupt-App ────────────────────────────────────────────────────────────────
export default function App() {
  const mapsRef = useRef((() => {
    const cloned = JSON.parse(JSON.stringify(INIT_MAPS));
    cloned.forEach(m => markAllSeen(m.tree));
    return cloned;
  })());
  const [, setTick] = useState(0);
  const rr = () => setTick(t => t+1);

  const [activeIdx, setActiveIdx] = useState(0);
  const [path, setPath]           = useState([mapsRef.current[0].tree]);
  const [detail, setDetail]       = useState(null);
  const [showNN, setShowNN]       = useState(false);
  const [nnV, setNnV]             = useState('');
  const [showNM, setShowNM]       = useState(false);
  const [nmV, setNmV]             = useState('');
  const [delNode, setDelNode]     = useState(null);
  const [delMapIdx, setDelMapIdx] = useState(null);
  const [flashDeck, setFlashDeck] = useState(false);
  const [selectedIdx, setSelectedIdx] = useState(-1);
  const [darkMode, setDarkMode]   = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [hideLearned, setHideLearned] = useState(false);
  const [undoInfo, setUndoInfo]   = useState(null); // { type:'node'|'map', payload, timeout }
  const theme = darkMode ? THEMES.dark : THEMES.light;

  const maps = mapsRef.current;
  const amap = maps[activeIdx];
  const cur  = path[path.length-1];
  const progress = countLearned(amap.tree);
  const pct = progress.total > 0 ? Math.round((progress.learned / progress.total) * 100) : 0;
  // Root automatisch als gelernt markieren, sobald alle Unterknoten gelernt sind
  amap.tree.learned = progress.total > 0 && progress.learned === progress.total;

  const switchMap = idx => {
    setActiveIdx(idx); setPath([maps[idx].tree]);
    setDetail(null); setShowNN(false); setShowNM(false); rr();
  };
  const navigateInto = node => { setPath(p=>[...p,node]); setDetail(null); setSelectedIdx(-1); };
  const openDetail   = node => { if (!node.images) node.images=[]; if (!node.videos) node.videos=[]; if (!node.files) node.files=[]; setDetail(node); };
  const toggleLearned = node => { node.learned = !node.learned; rr(); };

  const addNode = () => {
    const label=nnV.trim(); if(!label) return setShowNN(false);
    const col=PALETTE[cur.children.length%PALETTE.length];
    cur.children.push({id:uid(),label,color:col,definition:'',note:'',images:[],videos:[],files:[],learned:false,children:[]});
    setShowNN(false); setNnV(''); rr();
  };

  const addChild = (parentNode, label) => {
    parentNode.children.push({id:uid(),label,color:parentNode.color,definition:'',note:'',images:[],videos:[],files:[],learned:false,children:[]});
    setPath(p=>[...p,parentNode]); setDetail(null); rr();
  };

  const deleteNode = () => {
    if (!delNode) return;
    const parent=findParent(delNode,maps[activeIdx].tree);
    if (!parent) return;
    const i=parent.indexOf(delNode);
    if (i===-1) return;
    parent.splice(i,1);
    setPath(p=>{const idx=p.indexOf(delNode);return idx!==-1?p.slice(0,idx):p;});
    setDetail(null); setDelNode(null); rr();
    triggerUndo('node', { parent, index:i, item:delNode, label:delNode.label });
  };

  const addMap = () => {
    const label=nmV.trim(); if(!label) return setShowNM(false);
    const col=PALETTE[maps.length%PALETTE.length], newId='map-'+uid();
    maps.push({id:newId,label,color:col,nodeShape:'circle',customPos:{},
      tree:{id:'root-'+newId,label,color:col,definition:'',note:'',images:[],videos:[],files:[],learned:false,children:[]}});
    setShowNM(false); setNmV(''); switchMap(maps.length-1);
  };

  const deleteMap = () => {
    if (delMapIdx===null||maps.length<=1) return;
    const removedMap = maps[delMapIdx];
    const removedIdx = delMapIdx;
    maps.splice(delMapIdx,1);
    const newIdx=activeIdx===delMapIdx?Math.max(0,delMapIdx-1):activeIdx>delMapIdx?activeIdx-1:activeIdx;
    setDelMapIdx(null); switchMap(Math.min(newIdx,maps.length-1));
    triggerUndo('map', { map:removedMap, index:removedIdx, label:removedMap.label });
  };

  // ── Undo-Mechanismus für Lösch-Aktionen (Knoten & Maps) ──
  const triggerUndo = (type, payload) => {
    if (undoInfo?.timeoutId) clearTimeout(undoInfo.timeoutId);
    const timeoutId = setTimeout(() => setUndoInfo(null), 6000);
    setUndoInfo({ type, payload, timeoutId });
  };
  const performUndo = () => {
    if (!undoInfo) return;
    clearTimeout(undoInfo.timeoutId);
    if (undoInfo.type === 'node') {
      const { parent, index, item } = undoInfo.payload;
      const safeIndex = Math.min(index, parent.length);
      parent.splice(safeIndex, 0, item);
    } else if (undoInfo.type === 'map') {
      const { map, index } = undoInfo.payload;
      const safeIndex = Math.min(index, maps.length);
      maps.splice(safeIndex, 0, map);
      switchMap(safeIndex);
    }
    setUndoInfo(null); rr();
  };

  const moveNode = (viewId,nodeId,newPos) => {
    if (!amap.customPos[viewId]) amap.customPos[viewId]={};
    amap.customPos[viewId][nodeId]=newPos; rr();
  };

  const resetCurrentLayout = () => { if(amap.customPos[cur.id]){delete amap.customPos[cur.id];rr();} };
  const setShape = sh => { amap.nodeShape=sh; rr(); };
  const isRoot   = n => n.id===amap.tree.id;
  const hasCustomPos = !!(amap.customPos[cur.id]&&Object.keys(amap.customPos[cur.id]).length>0);

  // Springt zu einem Knoten aus der Suche: baut den Navigationspfad bis inkl. Elternknoten auf,
  // öffnet danach direkt das Detail-Panel des Zielknotens
  const jumpToPath = (fullPath) => {
    if (fullPath.length === 1) { setPath([fullPath[0]]); setDetail(null); return; }
    const parentPath = fullPath.slice(0, -1);
    const target = fullPath[fullPath.length - 1];
    setPath(parentPath);
    setSelectedIdx(-1);
    setTimeout(() => openDetail(target), 0);
  };

  useEffect(() => { setSelectedIdx(-1); }, [cur.id]);

  useEffect(() => {
    const fn = e => {
      const tag = (e.target.tagName||'').toLowerCase();
      if (tag==='input'||tag==='textarea') return;
      if (flashDeck) return;
      if ((e.ctrlKey||e.metaKey) && e.key.toLowerCase()==='f') { e.preventDefault(); setShowSearch(true); return; }
      if (e.key==='Enter') { e.preventDefault(); setShowNN(v=>!v); }
      else if (e.key==='Escape') {
        if (showSearch) setShowSearch(false);
        else if (detail) setDetail(null);
        else if (showNN) setShowNN(false);
        else if (showNM) setShowNM(false);
        else if (delNode) setDelNode(null);
        else if (delMapIdx!==null) setDelMapIdx(null);
      }
      else if (e.key==='ArrowLeft') setSelectedIdx(i => Math.max(-1, i-1));
      else if (e.key==='ArrowRight') setSelectedIdx(i => Math.min(cur.children.length-1, i+1));
      else if (e.key==='ArrowUp') { if (path.length>1) setPath(p=>p.slice(0,-1)); }
      else if (e.key==='ArrowDown') {
        const idx = selectedIdx>=0 ? selectedIdx : 0;
        const child = cur.children[idx];
        if (child) navigateInto(child);
      }
    };
    window.addEventListener('keydown', fn);
    return () => window.removeEventListener('keydown', fn);
  }, [flashDeck, detail, showNN, showNM, delNode, delMapIdx, path, selectedIdx, cur, showSearch]);

  const S_BTN = {fontFamily:'inherit',fontSize:13,background:'#FBFAF8',color:'#1F1E1C',border:'0.5px solid #D7D4CC',borderRadius:8,height:32,cursor:'pointer',padding:'0 12px'};
  const S_INP = {fontFamily:'inherit',fontSize:13,padding:'0 10px',height:32,border:'0.5px solid #D7D4CC',borderRadius:8,background:'#fff',color:'#1F1E1C',flex:1,minWidth:160};
  const S_ROW = {display:'flex',gap:8,flexWrap:'wrap',alignItems:'center'};

  return (
    <>
      <style>{`
        *{box-sizing:border-box;margin:0;padding:0;}
        html,body,#root{height:100%;width:100%;margin:0;padding:0;}
        body{background:${theme.bg};font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;color:${theme.text};overflow:hidden;}
        button:hover{filter:brightness(0.95);}
        .pill-active{background:${theme.accent}!important;border-color:${theme.accent}!important;color:#fff!important;}
        .shape-active{background:${theme.accentFill}!important;border-color:${theme.accent}!important;color:${theme.accent}!important;}
        .modal-bg{position:fixed;inset:0;background:rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center;z-index:1000;padding:16px;}
        .modal{background:${theme.surface};border-radius:14px;border:0.5px solid ${theme.border};padding:1.25rem;max-width:380px;width:100%;box-shadow:0 8px 30px rgba(0,0,0,.25);color:${theme.text};}
        .del-btn{background:#993556!important;color:#fff!important;border-color:#993556!important;}
        .reset-btn{background:#FFF3E0!important;border-color:#E0A830!important;color:#7A5800!important;}
        .img-thumb:hover .img-del{opacity:1;}
        .img-del{opacity:0;transition:opacity .15s;position:absolute;top:3px;right:3px;background:rgba(153,53,86,.9);color:#fff;border:none;border-radius:50%;width:20px;height:20px;font-size:11px;cursor:pointer;display:flex;align-items:center;justify-content:center;}
        .drop-zone{border:1.5px dashed ${theme.borderStrong};border-radius:8px;padding:10px;text-align:center;cursor:pointer;color:${theme.textSoft};font-size:12px;transition:background .15s,border-color .15s;}
        .drop-zone:hover,.drop-zone.drag-over{background:${theme.accentFill};border-color:${theme.accent};color:${theme.accent};}

        /* ── Lebendige Mikro-Interaktionen ── */
        @keyframes modalPop{0%{opacity:0;transform:scale(.92) translateY(6px);}100%{opacity:1;transform:scale(1) translateY(0);}}
        @keyframes overlayFade{0%{opacity:0;}100%{opacity:1;}}
        @keyframes toastSlideUp{0%{opacity:0;transform:translate(-50%,16px);}100%{opacity:1;transform:translate(-50%,0);}}
        @keyframes savePulseRing{0%{box-shadow:0 0 0 0 rgba(15,110,86,.45);}100%{box-shadow:0 0 0 10px rgba(15,110,86,0);}}
        @keyframes shakeX{0%,100%{transform:translateX(0);}20%{transform:translateX(-4px);}40%{transform:translateX(4px);}60%{transform:translateX(-3px);}80%{transform:translateX(3px);}}
        @keyframes tagPop{0%{transform:scale(.5);opacity:0;}60%{transform:scale(1.08);opacity:1;}100%{transform:scale(1);}}
        @keyframes checkPop{0%{transform:scale(0) rotate(-20deg);}60%{transform:scale(1.25) rotate(4deg);}100%{transform:scale(1) rotate(0);}}

        .modal-bg{animation:overlayFade .18s ease both;}
        .modal{animation:modalPop .22s cubic-bezier(.34,1.56,.64,1) both;}
        .save-pulse{animation:savePulseRing .7s ease-out;}
        button{transition:transform .12s ease, filter .12s ease, background .15s ease, border-color .15s ease;}
        button:active{transform:scale(0.94);}
        .pill-active{transition:background .25s ease, color .25s ease;}
        .map-fade-in{animation:overlayFade .25s ease both;}
        .tag-chip{animation:tagPop .28s cubic-bezier(.34,1.56,.64,1) both;}
        .toast-anim{animation:toastSlideUp .3s cubic-bezier(.34,1.56,.64,1) both;}
        .del-btn:active{animation:shakeX .35s ease;}
        input[type=checkbox]{transition:transform .15s ease;}
        input[type=checkbox]:checked{animation:checkPop .3s cubic-bezier(.34,1.56,.64,1);}
        .crumb-hover:hover{text-decoration:underline; text-underline-offset:3px;}
      `}</style>

      <div style={{width:'100%',height:'100vh',display:'flex',flexDirection:'column',gap:0, background:theme.bg}}>
        {/* ── Header ── */}
        <div style={{background:theme.surface,padding:'16px 24px',borderBottom:'0.5px solid '+theme.border}}>
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',flexWrap:'wrap',gap:12}}>
            <div>
              <h1 style={{fontSize:20,marginBottom:2, color:theme.text}}>🧠 Mindmap Lernplattform</h1>
              <p style={{fontSize:13,color:theme.textSoft}}>Klicke auf einen Zweig zum Zoomen · Mausrad zum Vergrößern · Knoten ziehen</p>
            </div>
            <div style={{display:'flex',alignItems:'center',gap:10}}>
              <span style={{fontSize:12,color:theme.textSoft,whiteSpace:'nowrap'}}>{progress.learned}/{progress.total} gelernt</span>
              <div style={{width:140,height:8,background:theme.border,borderRadius:99,overflow:'hidden'}}>
                <div style={{width:`${pct}%`,height:'100%',background:'#0F6E56',borderRadius:99,transition:'width .3s'}}/>
              </div>
              <span style={{fontSize:13,fontWeight:600,color:'#0F6E56',minWidth:36}}>{pct}%</span>
              <button style={{...S_BTN, width:32, height:32, padding:0}} onClick={()=>setShowSearch(true)} title="Suche (Strg+F)">🔍</button>
              <button style={{...S_BTN, width:32, height:32, padding:0}} onClick={()=>setDarkMode(d=>!d)} title="Dunkelmodus umschalten">{darkMode?'☀️':'🌙'}</button>
            </div>
          </div>

          {/* Maps-Leiste */}
          <div style={{...S_ROW,marginTop:12,paddingTop:12,borderTop:'0.5px solid '+theme.border}}>
            {maps.map((m,i)=>(
              <button key={m.id} className={i===activeIdx?'pill-active':''} onClick={()=>switchMap(i)}
                style={{...S_BTN,borderRadius:999,display:'flex',alignItems:'center',gap:6}}>
                <span style={{width:8,height:8,borderRadius:'50%',flexShrink:0,background:i===activeIdx?'rgba(255,255,255,.8)':STROKE[m.color]}}/>
                {m.label}
                {maps.length>1&&<span onClick={e=>{e.stopPropagation();setDelMapIdx(i);}} style={{marginLeft:2,opacity:.6,cursor:'pointer',fontSize:11}}>✕</span>}
              </button>
            ))}
            <button style={S_BTN} onClick={()=>setShowNM(v=>!v)}>＋ Neue Map</button>
          </div>

          {showNM&&(
            <div style={{...S_ROW,marginTop:10}}>
              <input style={S_INP} value={nmV} onChange={e=>setNmV(e.target.value)}
                placeholder="Name der neuen Map..." autoFocus
                onKeyDown={e=>{if(e.key==='Enter')addMap();if(e.key==='Escape')setShowNM(false);}}/>
              <button style={S_BTN} onClick={addMap}>✓ Erstellen</button>
              <button style={S_BTN} onClick={()=>setShowNM(false)}>Abbrechen</button>
            </div>
          )}
        </div>

        {/* ── Toolbar ── */}
        <div style={{background:theme.surface,borderLeft:'0.5px solid '+theme.border,borderRight:'0.5px solid '+theme.border,padding:'10px 24px',display:'flex',alignItems:'center',justifyContent:'space-between',gap:12,flexWrap:'wrap',borderBottom:'0.5px solid '+theme.border}}>
          {/* Breadcrumb */}
          <div style={{...S_ROW,fontSize:13,color:theme.textSoft}}>
            {path.map((n,i)=>(
              <span key={n.id} style={{display:'flex',alignItems:'center',gap:4}}>
                {i>0&&<span>›</span>}
                <span onClick={()=>setPath(path.slice(0,i+1))}
                  style={{cursor:'pointer',fontWeight:i===path.length-1?600:400,color:i===path.length-1?theme.text:theme.accent}}>
                  {n.label}
                </span>
              </span>
            ))}
          </div>
          <div style={S_ROW}>
            {/* Knotenform */}
            <span style={{fontSize:12,color:theme.textSoft}}>Form:</span>
            {[['circle','●'],['rect','▬'],['rounded','▬̈']].map(([sh,icon])=>(
              <button key={sh} className={amap.nodeShape===sh?'shape-active':''} style={{...S_BTN,padding:'0 8px',fontSize:13}} onClick={()=>setShape(sh)} title={sh}>{icon}</button>
            ))}
            {hasCustomPos&&<button className="reset-btn" style={S_BTN} onClick={resetCurrentLayout} title="Layout zurücksetzen">↺</button>}
            <button className={hideLearned?'shape-active':''} style={{...S_BTN, fontWeight:hideLearned?700:400}} onClick={()=>setHideLearned(v=>!v)} title="Gelernte Knoten ausblenden">
              {hideLearned ? '👁‍🗨 Filter: An' : '👁 Filter: Aus'}
            </button>
            <button style={S_BTN} onClick={()=>setFlashDeck(true)} title="Alle Knoten als Karteikarten ansehen">📇 Lernkarten</button>
            <button style={S_BTN} onClick={()=>setShowNN(v=>!v)}>＋ Knoten</button>
            <button style={S_BTN} onClick={()=>{setPath([amap.tree]);setDetail(null);}}>⌂</button>
          </div>
        </div>

        {showNN&&(
          <div style={{...S_ROW,padding:'8px 24px',background:theme.surface,borderLeft:'0.5px solid '+theme.border,borderRight:'0.5px solid '+theme.border,borderBottom:'0.5px solid '+theme.border}}>
            <input style={S_INP} value={nnV} onChange={e=>setNnV(e.target.value)}
              placeholder="Name des neuen Zweigs..." autoFocus
              onKeyDown={e=>{if(e.key==='Enter')addNode();if(e.key==='Escape')setShowNN(false);}}/>
            <button style={S_BTN} onClick={addNode}>✓</button>
            <button style={S_BTN} onClick={()=>setShowNN(false)}>✕</button>
          </div>
        )}

        {/* ── Canvas + Detail nebeneinander ── */}
        <div style={{display:'flex', flex:1, minHeight:0}}>
          <CanvasDetailLayout
            cur={cur} path={path} amap={amap}
            detail={detail} isRoot={isRoot}
            navigateInto={navigateInto} openDetail={openDetail} moveNode={moveNode}
            setDetail={setDetail} setDelNode={setDelNode} addChild={addChild} rr={rr}
            selectedIdx={selectedIdx} theme={theme} hideLearned={hideLearned}
          />
        </div>
      </div>

      {/* ── Undo-Toast ── */}
      {undoInfo && (
        <div className="toast-anim" style={{position:'fixed', bottom:24, left:'50%', transform:'translateX(-50%)', background:'#1F1E1C', color:'#fff', borderRadius:10, padding:'10px 12px 10px 16px', display:'flex', alignItems:'center', gap:14, boxShadow:'0 8px 24px rgba(0,0,0,.25)', zIndex:2500, fontSize:13}}>
          <span>{undoInfo.type==='map' ? `Map "${undoInfo.payload.label}" gelöscht` : `"${undoInfo.payload.label}" gelöscht`}</span>
          <button onClick={performUndo} style={{background:'rgba(255,255,255,0.15)', color:'#fff', border:'none', borderRadius:7, height:28, padding:'0 12px', cursor:'pointer', fontFamily:'inherit', fontWeight:600, fontSize:12}}>Rückgängig</button>
        </div>
      )}

      {/* ── Suche ── */}
      {showSearch && (
        <SearchOverlay tree={amap.tree} onJump={jumpToPath} onClose={()=>setShowSearch(false)} theme={theme}/>
      )}

      {/* ── Lernkarten-Deck ── */}
      {flashDeck && (
        <FlashcardDeck
          mapLabel={amap.label}
          root={amap.tree}
          onClose={()=>setFlashDeck(false)}
          onToggleLearned={toggleLearned}
          onUpdate={rr}
        />
      )}

      {/* ── Modal: Knoten löschen ── */}
      {delNode&&(
        <div className="modal-bg" onClick={()=>setDelNode(null)}>
          <div className="modal" onClick={e=>e.stopPropagation()}>
            <h3 style={{fontSize:16,marginBottom:8}}>⚠️ Knoten löschen?</h3>
            <p style={{fontSize:14,color:'#6B6963',marginBottom:16,lineHeight:1.5}}>
              {delNode.children?.length>0
                ?`Möchtest du "${delNode.label}" samt aller Unterzweige wirklich löschen?`
                :`Möchtest du "${delNode.label}" wirklich löschen?`}
              {' '}Diese Aktion kann nicht rückgängig gemacht werden.
            </p>
            <div style={{...S_ROW,justifyContent:'flex-end'}}>
              <button style={S_BTN} onClick={()=>setDelNode(null)}>Abbrechen</button>
              <button className="del-btn" style={S_BTN} onClick={deleteNode}>Löschen</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: Map löschen ── */}
      {delMapIdx!==null&&(
        <div className="modal-bg" onClick={()=>setDelMapIdx(null)}>
          <div className="modal" onClick={e=>e.stopPropagation()}>
            <h3 style={{fontSize:16,marginBottom:8}}>⚠️ Map löschen?</h3>
            <p style={{fontSize:14,color:'#6B6963',marginBottom:16,lineHeight:1.5}}>
              {`Möchtest du die Map "${maps[delMapIdx]?.label}" samt allen Knoten wirklich löschen? Diese Aktion kann nicht rückgängig gemacht werden.`}
            </p>
            <div style={{...S_ROW,justifyContent:'flex-end'}}>
              <button style={S_BTN} onClick={()=>setDelMapIdx(null)}>Abbrechen</button>
              <button className="del-btn" style={S_BTN} onClick={deleteMap}>Löschen</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}