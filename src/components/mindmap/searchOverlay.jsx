import { useState, useEffect, useMemo, useRef } from "react";

const STROKE = { 'c-purple':'#534AB7','c-teal':'#0F6E56','c-coral':'#993C1D','c-pink':'#993556','c-gray':'#5F5E5A' };

function collectAllNodes(node, path = []) {
  const here = [...path, node];
  let out = [{ node, path: here }];
  for (const c of (node.children || [])) out = out.concat(collectAllNodes(c, here));
  return out;
}

export default function SearchOverlay({ tree, onJump, onClose, theme }) {
  const [q, setQ] = useState('');
  const inputRef = useRef(null);
  const t = theme || {
    surface:'#fff', bg:'#F7F6F3', border:'#E6E4DF', surface2:'#FBFAF8',
    text:'#1F1E1C', textSoft:'#6B6963', accent:'#534AB7', accentFill:'#EFE9FB',
  };

  const allNodes = useMemo(() => collectAllNodes(tree), [tree]);

  const results = useMemo(() => {
    const query = q.trim().toLowerCase();
    if (!query) return allNodes.filter(({ node }) => node !== tree).slice(0, 12);
    return allNodes.filter(({ node }) => {
      if (node === tree) return false;
      return (
        (node.label || '').toLowerCase().includes(query) ||
        (node.definition || '').toLowerCase().includes(query) ||
        (node.note || '').toLowerCase().includes(query) ||
        (node.tags || []).some(tg => tg.toLowerCase().includes(query))
      );
    });
  }, [q, allNodes, tree]);

  useEffect(() => {
    const fn = e => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', fn);
    return () => window.removeEventListener('keydown', fn);
  }, [onClose]);

  useEffect(() => { inputRef.current?.focus(); }, []);

  return (
    <div onClick={onClose} style={{
      position:'fixed', inset:0, background:'rgba(0,0,0,.45)',
      display:'flex', alignItems:'flex-start', justifyContent:'center',
      zIndex:1500, paddingTop:'12vh',
    }}>
      <div onClick={e=>e.stopPropagation()} style={{
        width:'100%', maxWidth:560, background:t.surface, borderRadius:14,
        border:'0.5px solid '+t.border, boxShadow:'0 20px 60px rgba(0,0,0,.3)', overflow:'hidden',
      }}>
        <div style={{display:'flex', alignItems:'center', gap:10, padding:'12px 14px', borderBottom:'0.5px solid '+t.border}}>
          <span style={{fontSize:16}}>🔍</span>
          <input ref={inputRef} value={q} onChange={e=>setQ(e.target.value)} placeholder="Knoten suchen... (Label, Definition, Notiz, Tags)"
            style={{flex:1, border:'none', outline:'none', background:'transparent', fontFamily:'inherit', fontSize:15, color:t.text}}/>
          <button onClick={onClose} style={{background:'transparent', border:'none', color:t.textSoft, cursor:'pointer', fontSize:16}}>✕</button>
        </div>
        <div style={{maxHeight:'50vh', overflowY:'auto', padding:6}}>
          {results.length === 0 ? (
            <div style={{padding:'24px', textAlign:'center', color:t.textSoft, fontSize:14}}>Keine Ergebnisse für „{q}"</div>
          ) : results.map(({ node, path }) => (
            <div key={node.id} onClick={()=>onJump(path)} style={{
              display:'flex', alignItems:'center', gap:10, padding:'9px 12px', borderRadius:8, cursor:'pointer',
            }}
              onMouseEnter={e=>e.currentTarget.style.background=t.accentFill}
              onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
              <span style={{width:8, height:8, borderRadius:'50%', background:STROKE[node.color]||'#534AB7', flexShrink:0}}/>
              <div style={{flex:1, minWidth:0}}>
                <div style={{fontSize:14, fontWeight:500, color:t.text, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>{node.label}</div>
                <div style={{fontSize:11, color:t.textSoft, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>
                  {path.map(p=>p.label).join(' › ')}
                </div>
              </div>
              {node.learned && <span style={{fontSize:11, color:'#0F6E56', flexShrink:0}}>✓</span>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}