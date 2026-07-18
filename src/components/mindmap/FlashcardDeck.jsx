import { useState, useEffect, useMemo, useRef } from "react";

let _fcUid = 0;
const uid = () => 'fc' + (_fcUid++);

const STROKE = { 'c-purple':'#534AB7','c-teal':'#0F6E56','c-coral':'#993C1D','c-pink':'#993556','c-gray':'#5F5E5A' };
const FILL   = { 'c-purple':'#EFE9FB','c-teal':'#E3F3EE','c-coral':'#FBEAE2','c-pink':'#FBE7ED','c-gray':'#EEEDEA' };
const isVideoSrc = src => src.startsWith('data:video') || /\.(mp4|webm|ogg|mov|avi|mkv)(\?|$)/i.test(src);

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
  const [defV, setDefV] = useState('');
  const [noteV, setNoteV] = useState('');
  const fileInputRef = useRef(null);
  const videoInputRef = useRef(null);

  const node = items[idx]?.node;
  const accent = node ? (STROKE[node.color] || '#534AB7') : '#534AB7';
  const fill   = node ? (FILL[node.color] || '#EFE9FB') : '#EFE9FB';

  useEffect(() => { setFlipped(false); setEditing(false); }, [idx]);

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

  const handleFiles = files => {
    files.forEach(file => {
      if (!file.type.startsWith('image/')) return;
      const reader = new FileReader();
      reader.onload = ev => {
        if (!node.images) node.images = [];
        node.images.push({ id: uid(), src: ev.target.result, caption: file.name });
        onUpdate && onUpdate();
      };
      reader.readAsDataURL(file);
    });
  };
  const handleVideoFiles = files => {
    files.forEach(file => {
      if (!file.type.startsWith('video/')) return;
      const reader = new FileReader();
      reader.onload = ev => {
        if (!node.videos) node.videos = [];
        node.videos.push({ id: uid(), src: ev.target.result, caption: file.name });
        onUpdate && onUpdate();
      };
      reader.readAsDataURL(file);
    });
  };
  const removeImage = id => { node.images = (node.images||[]).filter(i=>i.id!==id); onUpdate && onUpdate(); };
  const removeVideo = id => { node.videos = (node.videos||[]).filter(v=>v.id!==id); onUpdate && onUpdate(); };

  const startEdit = () => { setDefV(node.definition || ''); setNoteV(node.note || ''); setEditing(true); };
  const saveEdit  = () => { node.definition = defV; node.note = noteV; setEditing(false); onUpdate && onUpdate(); };
  const cancelEdit = () => setEditing(false);

  const S_BTN = { fontFamily:'inherit', fontSize:13, background:'#fff', color:'#1F1E1C', border:'0.5px solid #E6E4DF', borderRadius:8, height:38, cursor:'pointer', padding:'0 14px' };
  const S_LABEL = { fontSize:10, fontWeight:700, color:'#6B6963', textTransform:'uppercase', letterSpacing:'.08em', marginBottom:4 };
  const S_TA = { fontFamily:'inherit', fontSize:13, padding:'8px 10px', width:'100%', resize:'vertical', border:'0.5px solid #D7D4CC', borderRadius:8, background:'#fff', color:'#1F1E1C', boxSizing:'border-box', lineHeight:1.5 };

  return (
    <div style={{position:'fixed',inset:0,background:'#F2F1ED',zIndex:2000,display:'flex'}}>

      {/* ─── Linkes Panel: Übersicht & Bearbeitung ─── */}
      <div style={{width:280, flexShrink:0, background:'#fff', borderRight:'0.5px solid #E6E4DF', display:'flex', flexDirection:'column'}}>
        <div style={{padding:'14px 16px', borderBottom:'0.5px solid #E6E4DF', display:'flex', justifyContent:'space-between', alignItems:'center', flexShrink:0}}>
          <div style={{fontWeight:600, fontSize:14}}>📋 Übersicht</div>
          <button onClick={onClose} style={{...S_BTN, width:30, height:30, padding:0, fontSize:14}}>✕</button>
        </div>

        {/* Baum */}
        <div style={{flex:1, overflowY:'auto', padding:'8px 6px'}}>
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

        {/* Editor */}
        {editing ? (
          <div style={{borderTop:'0.5px solid #E6E4DF', padding:14, display:'flex', flexDirection:'column', gap:10, flexShrink:0, maxHeight:'70%', overflowY:'auto'}}>
            <div style={{display:'flex', alignItems:'center', gap:6, fontSize:13, fontWeight:600}}>
              <span style={{width:8, height:8, borderRadius:'50%', background:accent}}/>
              {node.label}
            </div>
            <div>
              <div style={S_LABEL}>Definition</div>
              <textarea rows={5} value={defV} onChange={e=>setDefV(e.target.value)} style={S_TA} placeholder="Definition..."/>
            </div>
            <div>
              <div style={S_LABEL}>Notiz</div>
              <textarea rows={3} value={noteV} onChange={e=>setNoteV(e.target.value)} style={S_TA} placeholder="Notiz..."/>
            </div>
            <div>
              <div style={S_LABEL}>Bilder</div>
              {node.images && node.images.length > 0 && (
                <div style={{display:'flex', gap:6, flexWrap:'wrap', marginBottom:6}}>
                  {node.images.map(img => (
                    <div key={img.id} style={{position:'relative'}}>
                      <img src={img.src} alt={img.caption} onClick={()=>setLightbox(img.src)} style={{width:54, height:54, objectFit:'cover', borderRadius:6, border:'0.5px solid #D7D4CC', cursor:'zoom-in'}}/>
                      <button onClick={()=>removeImage(img.id)} style={{position:'absolute', top:2, right:2, background:'rgba(153,53,86,.9)', color:'#fff', border:'none', borderRadius:'50%', width:16, height:16, fontSize:9, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center'}}>✕</button>
                    </div>
                  ))}
                </div>
              )}
              <button onClick={()=>fileInputRef.current?.click()} style={{...S_BTN, width:'100%', height:30, fontSize:12}}>＋ Bild hinzufügen</button>
              <input ref={fileInputRef} type="file" accept="image/*" multiple style={{display:'none'}} onChange={e=>{handleFiles(Array.from(e.target.files)); e.target.value='';}}/>
            </div>
            <div>
              <div style={S_LABEL}>Videos</div>
              {node.videos && node.videos.length > 0 && (
                <div style={{display:'flex', gap:6, flexWrap:'wrap', marginBottom:6}}>
                  {node.videos.map(vid => (
                    <div key={vid.id} style={{position:'relative'}}>
                      <div onClick={()=>setLightbox(vid.src)} style={{width:54, height:54, borderRadius:6, overflow:'hidden', position:'relative', background:'#1F1E1C', cursor:'zoom-in'}}>
                        <video src={vid.src} muted preload="metadata" style={{width:'100%', height:'100%', objectFit:'cover', pointerEvents:'none'}}/>
                        <span style={{position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center', color:'#fff', fontSize:14}}>▶</span>
                      </div>
                      <button onClick={()=>removeVideo(vid.id)} style={{position:'absolute', top:2, right:2, background:'rgba(153,53,86,.9)', color:'#fff', border:'none', borderRadius:'50%', width:16, height:16, fontSize:9, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center'}}>✕</button>
                    </div>
                  ))}
                </div>
              )}
              <button onClick={()=>videoInputRef.current?.click()} style={{...S_BTN, width:'100%', height:30, fontSize:12}}>＋ Video hinzufügen</button>
              <input ref={videoInputRef} type="file" accept="video/*" multiple style={{display:'none'}} onChange={e=>{handleVideoFiles(Array.from(e.target.files)); e.target.value='';}}/>
            </div>
            <div style={{display:'flex', gap:6}}>
              <button onClick={saveEdit} style={{...S_BTN, flex:1, background:accent, color:'#fff', borderColor:accent}}>✓ Speichern</button>
              <button onClick={cancelEdit} style={S_BTN}>Abbrechen</button>
            </div>
          </div>
        ) : (
          <div style={{borderTop:'0.5px solid #E6E4DF', padding:10, flexShrink:0}}>
            <button onClick={startEdit} style={{...S_BTN, width:'100%'}}>✏️ Karte bearbeiten</button>
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
                <div style={{flex:1, overflowY:'auto', minHeight:0, WebkitOverflowScrolling:'touch', display:'flex', flexDirection:'column', gap:14, paddingRight:4}}>
                  <div>
                    <div style={{fontSize:10, fontWeight:700, color:'#6B6963', textTransform:'uppercase', letterSpacing:'.08em', marginBottom:4}}>Definition</div>
                    <div style={{fontSize:14, color:'#3C3B38', lineHeight:1.6, whiteSpace:'pre-wrap'}}>{node.definition || <span style={{color:'#B3B0A9', fontStyle:'italic'}}>Keine Definition vorhanden</span>}</div>
                  </div>
                  {node.note ? (
                    <div style={{padding:10, background:fill, borderRadius:8, fontSize:12, color:'#5F5E5A', borderLeft:'3px solid '+accent, whiteSpace:'pre-wrap'}}>📝 {node.note}</div>
                  ) : null}
                  {node.images && node.images.length > 0 && (
                    <div>
                      <div style={{fontSize:10, fontWeight:700, color:'#6B6963', textTransform:'uppercase', letterSpacing:'.08em', marginBottom:6}}>Bilder</div>
                      <div style={{display:'flex', gap:8, flexWrap:'wrap'}}>
                        {node.images.map(img => (
                          <img key={img.id} src={img.src} alt={img.caption} onClick={e=>{e.stopPropagation(); setLightbox(img.src);}} style={{width:80, height:80, objectFit:'cover', borderRadius:8, border:'0.5px solid #D7D4CC', cursor:'zoom-in'}}/>
                        ))}
                      </div>
                    </div>
                  )}
                  {node.videos && node.videos.length > 0 && (
                    <div>
                      <div style={{fontSize:10, fontWeight:700, color:'#6B6963', textTransform:'uppercase', letterSpacing:'.08em', marginBottom:6}}>Videos</div>
                      <div style={{display:'flex', gap:8, flexWrap:'wrap'}}>
                        {node.videos.map(vid => (
                          <div key={vid.id} onClick={e=>{e.stopPropagation(); setLightbox(vid.src);}} style={{width:80, height:80, borderRadius:8, overflow:'hidden', position:'relative', background:'#1F1E1C', cursor:'zoom-in'}}>
                            <video src={vid.src} muted preload="metadata" style={{width:'100%', height:'100%', objectFit:'cover', pointerEvents:'none'}}/>
                            <span style={{position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center', color:'#fff', fontSize:22}}>▶</span>
                          </div>
                        ))}
                      </div>
                    </div>
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