import { useState, useEffect, useMemo } from "react";
import {
  STROKE, FILL, isVideoSrc,
  ensureBlocks, makeBlock,
  BlockRow, SlashMenu, BlockView,
} from "./blockEditor";

export default function FlashcardDeck({ mapLabel, root, onClose, onToggleLearned, onUpdate }) {
  // Baum aller Karten (ohne Wurzel) mit Verschachtelungstiefe
  const items = useMemo(() => {
    const out = [];
    const walk = (n, depth) => {
      if (n !== root) out.push({ node: n, depth });
      (n.children || []).forEach(c => walk(c, depth + 1));
    };
    walk(root, 0);
    return out;
  }, [root]);

  const [idx, setIdx] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [lightbox, setLightbox] = useState(null);
  const [editing, setEditing] = useState(false);
  const [slashOpenFor, setSlashOpenFor] = useState(null); // Block-ID, für den das Slash-Menü offen ist
  const [focusBlockId, setFocusBlockId] = useState(null);
  const [, forceTick] = useState(0);

  const node = items[idx]?.node;
  const accent = node ? (STROKE[node.color] || '#534AB7') : '#534AB7';
  const fill   = node ? (FILL[node.color] || '#EFE9FB') : '#EFE9FB';

  // Bei jedem Kartenwechsel: Bearbeitungsmodus & Slash-Menü zurücksetzen
  useEffect(() => { setFlipped(false); setEditing(false); setSlashOpenFor(null); setFocusBlockId(null); }, [idx]);

  useEffect(() => {
    const fn = e => {
      if (e.key === 'Escape') { if (editing) setEditing(false); else onClose(); return; }
      if (editing) return;
      if (e.key === 'ArrowLeft' && idx > 0) setIdx(idx - 1);
      else if (e.key === 'ArrowRight' && idx < items.length - 1) setIdx(idx + 1);
      else if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); setFlipped(f => !f); }
    };
    window.addEventListener('keydown', fn);
    return () => window.removeEventListener('keydown', fn);
  }, [idx, items.length, onClose, editing]);

  if (!node) return null;

  // Migriert bei Bedarf die alten Felder (definition/note/images/videos) einmalig in node.blocks -
  // dasselbe kanonische Format, das auch das DetailPanel in Home.jsx verwendet.
  const blocks = ensureBlocks(node);

  // Erzwingt ein Re-Render dieser Komponente (Blöcke werden per Mutation auf node.blocks
  // aktualisiert) und benachrichtigt zusätzlich die App, damit z.B. der Lernfortschritt
  // im Header aktuell bleibt.
  const rr = () => { forceTick(t => t + 1); onUpdate && onUpdate(); };

  const updateBlock = (id, newBlock) => {
    const i = blocks.findIndex(b => b.id === id);
    if (i === -1) return;
    const copy = [...blocks];
    copy[i] = newBlock;
    node.blocks = copy;
    rr();
  };
  const removeBlock = id => {
    let copy = blocks.filter(b => b.id !== id);
    if (copy.length === 0) copy = [makeBlock('text')];
    node.blocks = copy;
    rr();
  };
  const insertBlockAfter = (id, newBlock) => {
    const i = blocks.findIndex(b => b.id === id);
    const copy = [...blocks];
    copy.splice(i + 1, 0, newBlock);
    node.blocks = copy;
    setFocusBlockId(newBlock.id);
    rr();
  };
  const replaceBlockType = (id, cmd) => {
    const i = blocks.findIndex(b => b.id === id);
    if (i === -1) return;
    const fresh = cmd.make();
    fresh.id = blocks[i].id; // Position/Identität beibehalten
    const copy = [...blocks];
    copy[i] = fresh;
    node.blocks = copy;
    setSlashOpenFor(null);
    setFocusBlockId(fresh.id);
    rr();
  };
  const handleEnter = id => {
    const blk = blocks.find(b => b.id === id);
    const newType = (blk && (blk.type === 'bullet' || blk.type === 'numbered')) ? blk.type : 'text';
    insertBlockAfter(id, makeBlock(newType));
  };
  const handleBackspaceEmpty = id => {
    const i = blocks.findIndex(b => b.id === id);
    if (i <= 0) return; // ersten Block nicht per Backspace löschen
    removeBlock(id);
    setFocusBlockId(blocks[i - 1]?.id || null);
  };

  const S_BTN = { fontFamily:'inherit', fontSize:13, background:'#fff', color:'#1F1E1C', border:'0.5px solid #E6E4DF', borderRadius:8, height:38, cursor:'pointer', padding:'0 14px' };

  return (
    <div style={{position:'fixed',inset:0,background:'#F2F1ED',zIndex:2000,display:'flex'}}>

      {/* ─── Linkes Panel: Übersicht & Bearbeitung ─── */}
      <div style={{width:280, flexShrink:0, background:'#fff', borderRight:'0.5px solid #E6E4DF', display:'flex', flexDirection:'column'}}>
        <div style={{padding:'14px 16px', borderBottom:'0.5px solid #E6E4DF', display:'flex', justifyContent:'space-between', alignItems:'center', flexShrink:0}}>
          <div style={{fontWeight:600, fontSize:14}}>📋 Übersicht</div>
          <button onClick={onClose} style={{...S_BTN, width:30, height:30, padding:0, fontSize:14}}>✕</button>
        </div>

        {/* Baum */}
        <div style={{flex:1, overflowY:'auto', padding:'8px 6px', minHeight:0}}>
          {items.map((it, i) => (
            <div key={it.node.id} style={{paddingLeft: it.depth*16 + 6, position:'relative'}}>
              {it.depth > 0 && <span style={{position:'absolute', left: (it.depth-1)*16 + 12, top:0, bottom:0, width:1, background:'#E6E4DF'}}/>}
              <button onClick={()=>setIdx(i)} style={{
                width:'100%', display:'flex', alignItems:'center', gap:7, padding:'7px 9px', border:'none', borderRadius:7, cursor:'pointer',
                background: i===idx ? fill : 'transparent',
                color: i===idx ? accent : '#3C3B38',
                fontWeight: i===idx ? 600 : 400, fontSize:13, fontFamily:'inherit', textAlign:'left',
              }}>
                <span style={{width:7, height:7, borderRadius:'50%', background: STROKE[it.node.color], flexShrink:0}}/>
                <span style={{overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', flex:1}}>{it.node.label}</span>
                {it.node.learned && <span style={{color:'#0F6E56', fontSize:11, flexShrink:0}}>✓</span>}
                {it.node.children?.length > 0 && <span style={{color:'#9B9994', fontSize:10, flexShrink:0}}>▸</span>}
              </button>
            </div>
          ))}
        </div>

        {/* Block-Editor (gleiches Format wie Home.jsx-DetailPanel) */}
        {editing ? (
          <div style={{borderTop:'0.5px solid #E6E4DF', padding:14, display:'flex', flexDirection:'column', gap:2, flexShrink:0, maxHeight:'70%', overflowY:'auto'}}>
            <div style={{display:'flex', alignItems:'center', gap:6, fontSize:13, fontWeight:600, marginBottom:8}}>
              <span style={{width:8, height:8, borderRadius:'50%', background:accent}}/>
              {node.label}
            </div>

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
                    theme={null}
                    accentColor={accent}
                    listNumber={listNumber}
                    autoFocus={focusBlockId===block.id}
                    onChange={nb=>updateBlock(block.id, nb)}
                    onRemove={()=>removeBlock(block.id)}
                    onEnter={()=>handleEnter(block.id)}
                    onBackspaceEmpty={()=>handleBackspaceEmpty(block.id)}
                    onSlash={open=>setSlashOpenFor(open ? block.id : (slashOpenFor===block.id ? null : slashOpenFor))}
                  />
                  {slashOpenFor === block.id && (
                    <SlashMenu theme={null}
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
              style={{alignSelf:'flex-start', background:'transparent', border:'none', color:'#9B9994', fontSize:12.5, cursor:'pointer', padding:'6px 0', display:'flex', alignItems:'center', gap:6}}>
              ＋ Block hinzufügen
            </button>

            <button onClick={()=>setEditing(false)} style={{...S_BTN, marginTop:8, background:accent, color:'#fff', borderColor:accent}}>✓ Fertig</button>
          </div>
        ) : (
          <div style={{borderTop:'0.5px solid #E6E4DF', padding:10, flexShrink:0}}>
            <button onClick={()=>setEditing(true)} style={{...S_BTN, width:'100%'}}>✏️ Karte bearbeiten</button>
          </div>
        )}
      </div>

      {/* ─── Hauptbereich: Karte ─── */}
      <div style={{flex:1, display:'flex', flexDirection:'column', minWidth:0}}>

        {/* Top bar */}
        <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', padding:'14px 20px', background:'#fff', borderBottom:'0.5px solid #E6E4DF', flexShrink:0}}>
          <div style={{display:'flex', alignItems:'center', gap:10}}>
            <span style={{fontSize:18}}>📇</span>
            <div>
              <div style={{fontSize:15, fontWeight:600}}>{mapLabel} · Lernkarten</div>
              <div style={{fontSize:12, color:'#6B6963'}}>{idx + 1} / {items.length} Karten</div>
            </div>
          </div>
        </div>

        {/* Fortschrittsbalken */}
        <div style={{height:4, background:'#E6E4DF', flexShrink:0}}>
          <div style={{width:`${((idx + 1) / items.length) * 100}%`, height:'100%', background:accent, transition:'width .3s'}}/>
        </div>

        {/* Kartenbereich (3D-Flip) */}
        <div style={{flex:1, display:'flex', alignItems:'center', justifyContent:'center', padding:24, overflow:'auto'}}>
          <div onClick={()=>setFlipped(f=>!f)} style={{width:'100%', maxWidth:560, height:'min(70vh, 560px)', cursor:'pointer', perspective:1400}}>
            <div style={{position:'relative', width:'100%', height:'100%', transformStyle:'preserve-3d', transition:'transform .5s ease', transform: flipped ? 'rotateY(180deg)' : 'rotateY(0deg)'}}>
              {/* Vorderseite */}
              <div style={{position:'absolute', inset:0, backfaceVisibility:'hidden', WebkitBackfaceVisibility:'hidden', background:fill, border:'1px solid '+accent, borderRadius:18, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:32, boxShadow:'0 16px 50px rgba(0,0,0,.12)'}}>
                <div style={{fontSize:11, fontWeight:700, color:accent, textTransform:'uppercase', letterSpacing:'.12em', marginBottom:24, opacity:.7}}>Karte {idx + 1}</div>
                <div style={{fontSize:34, fontWeight:700, color:accent, textAlign:'center', lineHeight:1.15}}>{node.label}</div>
                <div style={{marginTop:18, fontSize:12, color:'#9B9994'}}>↻ Tippe zum Umdrehen</div>
              </div>
              {/* Rückseite */}
              <div style={{position:'absolute', inset:0, backfaceVisibility:'hidden', WebkitBackfaceVisibility:'hidden', background:'#fff', border:'1px solid '+accent, borderRadius:18, display:'flex', flexDirection:'column', padding:24, boxShadow:'0 16px 50px rgba(0,0,0,.12)', transform:'rotateY(180deg)', overflow:'hidden', transformStyle:'flat'}}>
                <div style={{display:'flex', alignItems:'center', gap:8, marginBottom:12, flexShrink:0}}>
                  <span style={{width:10, height:10, borderRadius:'50%', background:accent}}/>
                  <div style={{fontSize:17, fontWeight:600}}>{node.label}</div>
                </div>
                <div style={{flex:1, overflowY:'auto', minHeight:0, WebkitOverflowScrolling:'touch', paddingRight:4}} onClick={e=>e.stopPropagation()}>
                  {blocks.every(b => ['text','heading','quote','bullet','numbered','todo'].includes(b.type) && !b.content) ? (
                    <span style={{color:'#B3B0A9', fontStyle:'italic', fontSize:14}}>Keine Inhalte vorhanden</span>
                  ) : (
                    <BlockView blocks={blocks} theme={null} accentColor={accent} onOpenLightbox={src=>setLightbox(src)}/>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Steuerung */}
        <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', gap:10, padding:'14px 20px', background:'#fff', borderTop:'0.5px solid #E6E4DF', flexShrink:0, flexWrap:'wrap'}}>
          <button onClick={()=>setIdx(i=>Math.max(0, i-1))} disabled={idx===0} style={{...S_BTN, opacity:idx===0?0.4:1, cursor:idx===0?'default':'pointer'}}>← Zurück</button>
          <button onClick={()=>setFlipped(f=>!f)} style={{...S_BTN, background:fill, borderColor:accent, color:accent, fontWeight:600}}>{flipped ? 'Vorderseite' : 'Umdrehen'}</button>
          <button onClick={()=>onToggleLearned(node)} style={{...S_BTN, background:node.learned?'#0F6E56':'#fff', color:node.learned?'#fff':'#1F1E1C', borderColor:node.learned?'#0F6E56':'#E6E4DF'}}>{node.learned ? '✓ Gelernt' : 'Als gelernt markieren'}</button>
          <button onClick={()=>setIdx(i=>Math.min(items.length-1, i+1))} disabled={idx===items.length-1} style={{...S_BTN, opacity:idx===items.length-1?0.4:1, cursor:idx===items.length-1?'default':'pointer'}}>Weiter →</button>
        </div>
        <div style={{textAlign:'center', paddingBottom:10, fontSize:11, color:'#9B9994'}}>← → blättern · Leertaste umdrehen · Esc schließen</div>
      </div>

      {lightbox && (
        <div onClick={()=>setLightbox(null)} style={{position:'fixed', inset:0, background:'rgba(0,0,0,.85)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:3000, padding:24, cursor:'zoom-out'}}>
          {isVideoSrc(lightbox) ? (
            <video src={lightbox} controls autoPlay onClick={e=>e.stopPropagation()} style={{maxWidth:'88vw', maxHeight:'82vh', borderRadius:10}}/>
          ) : (
            <img src={lightbox} alt="" onClick={e=>e.stopPropagation()} style={{maxWidth:'88vw', maxHeight:'82vh', borderRadius:10}}/>
          )}
          <button onClick={()=>setLightbox(null)} style={{position:'absolute', top:16, right:16, background:'rgba(255,255,255,.15)', border:'none', color:'#fff', borderRadius:'50%', width:36, height:36, fontSize:18, cursor:'pointer'}}>✕</button>
        </div>
      )}
    </div>
  );
}