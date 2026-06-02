(function(){
var base=location.origin,m=location.pathname.match(/\/(\d+)\/(\d+)\/?$/);
if(!m){alert("GK Extractor: navigue vers un post précis.");return;}
var tid=m[1],pn=m[2],pni=parseInt(pn),D=document;
var ov=D.createElement('div');
ov.id='_gkx';
ov.style.cssText='position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;font-family:system-ui';
ov.innerHTML='<div style="background:#1e1e28;border:2px solid #7c6af0;border-radius:14px;padding:20px 24px;color:#e8e8f0;width:90%;max-width:480px"><b style="font-size:16px">🎮 GK Extractor</b><div id="_gks" style="color:#9898b0;margin:10px 0">…</div><div id="_gko" style="display:none"><textarea id="_gkt" style="width:100%;height:90px;background:#0f0f13;border:1px solid #7c6af0;color:#48c78e;border-radius:8px;padding:6px;font-size:10px;resize:vertical" readonly></textarea><div style="display:flex;gap:8px;margin-top:10px"><button id="_gkb" style="flex:1;background:#7c6af0;border:none;color:#fff;padding:9px;border-radius:7px;cursor:pointer;font-weight:700">📋 Copier</button><button onclick="document.getElementById(\'_gkx\').remove()" style="background:#26263a;border:1px solid #5a5a78;color:#e8e8f0;padding:9px 14px;border-radius:7px;cursor:pointer">Fermer</button></div></div><button onclick="document.getElementById(\'_gkx\').remove()" style="background:none;border:none;color:#5a5a78;cursor:pointer;font-size:12px;margin-top:6px">✕</button></div>';
D.body.appendChild(ov);
function st(x){D.getElementById('_gks').innerHTML=x;}

function extractName(txt){
  var s=(txt||'').replace(/\s+/g,' ').trim();
  var r=s.match(/attribuez.vous\s+[àa]\s+(.+?)\s*\??\s*$/i);
  return(r&&r[1]&&r[1].trim().length>1)?r[1].trim():null;
}

// Read all polls from live DOM using correct selectors
// Structure: div.poll > div.poll-container > div.poll-title
//                                          > div.discourse-poll-regular-results
//                                            > ul.results > li > div.option
//                                              > p > span.option-text (note)
//                                              > div.poll-voters > ul.poll-voters-list
//                                                > li > a[data-user-card]
function readFromDOM(){
  var polls=[];
  // Find all poll containers in page order
  D.querySelectorAll('div.poll').forEach(function(pollDiv){
    var titleEl=pollDiv.querySelector('.poll-title');
    var gameName=titleEl?extractName(titleEl.textContent):null;

    // Find preceding image (for vignette)
    var imageUrl=null;
    var el=pollDiv.parentElement?pollDiv.parentElement.previousElementSibling:null;
    // Walk up to find lightbox-wrapper sibling
    var container=pollDiv.closest('li,article,.cooked')||pollDiv.parentElement;
    if(container){
      var sib=pollDiv.previousElementSibling;
      var tries=0;
      while(sib&&tries<8){
        var img=sib.querySelector?sib.querySelector('img:not(.avatar):not(.emoji)'):null;
        if(!img&&sib.tagName==='IMG'&&!sib.classList.contains('avatar'))img=sib;
        if(img){
          var s=img.getAttribute('src')||'';
          if(s.startsWith('//'))s='https:'+s;
          else if(s.startsWith('/'))s=base+s;
          if(s&&!s.includes('avatar')&&!s.includes('emoji')){imageUrl=s;break;}
        }
        sib=sib.previousElementSibling;tries++;
      }
    }

    // Read voter per option
    var uv={};
    pollDiv.querySelectorAll('ul.results > li').forEach(function(li){
      var noteEl=li.querySelector('.option-text');
      if(!noteEl)return;
      var note=parseInt(noteEl.textContent.trim());
      if(isNaN(note)||note<1||note>10)return;
      // Use data-user-card attribute — most reliable source for username
      li.querySelectorAll('a[data-user-card]').forEach(function(a){
        var username=a.getAttribute('data-user-card')||'';
        username=username.trim();
        if(!username)return;
        var img=a.querySelector('img');
        var avatarUrl=img?img.getAttribute('src'):'';
        if(!uv[username])uv[username]={note:note,avatarUrl:avatarUrl||''};
      });
    });

    polls.push({gameName:gameName,imageUrl:imageUrl,userVotes:uv,
      voterCount:Object.keys(uv).length});
  });
  return polls;
}

async function run(){
  try{
    var domPolls=readFromDOM();
    if(!domPolls.length){
      st('⚠️ Aucun sondage visible (div.poll introuvable).<br>Assure-toi que les sondages sont affichés sur la page.');
      return;
    }
    var domTotal=domPolls.reduce(function(t,p){return t+p.voterCount;},0);
    st(domPolls.length+' sondage(s) · '+domTotal+' votants lus — appel API…');

    // 2 API calls only
    var cred={credentials:'include'};
    var r=await fetch(base+'/forum/t/'+tid+'/'+pn+'.json',cred);
    if(!r.ok)throw new Error('HTTP '+r.status+(r.status===429?' — rate limit actif, attends quelques minutes':''));
    var tp=await r.json();
    var posts=tp.post_stream&&tp.post_stream.posts||[];

    var ids=[pni-1,pni,pni+1,pni+2,pni+3];
    var r2=await fetch(base+'/forum/t/'+tid+'/posts.json?'+ids.map(function(i){return'post_ids[]='+i;}).join('&'),cred);
    if(r2.ok){
      var d2=await r2.json();
      (d2.post_stream&&d2.post_stream.posts||[]).forEach(function(p){
        if(!posts.find(function(x){return x.id===p.id;}))posts.push(p);
      });
    }

    var pwp=posts.filter(function(p){return p.polls&&p.polls.length>0;});
    if(!pwp.length){st('❌ Aucun sondage dans l\'API.');return;}

    // Flatten all polls from API in order
    var apiPolls=[];
    pwp.forEach(function(p){
      p.polls.forEach(function(po){apiPolls.push({post:p,poll:po});});
    });

    // Match DOM polls to API polls by position
    var res=[];
    apiPolls.forEach(function(ap,i){
      var po=ap.poll,p=ap.post;
      var domData=domPolls[i]||{userVotes:{},gameName:null,imageUrl:null};

      // Merge: DOM voters (real notes) + preloaded_voters supplement
      var uv=Object.assign({},domData.userVotes);
      if(po.preloaded_voters){
        Object.keys(po.preloaded_voters).forEach(function(optId){
          var opt=po.options.find(function(o){return o.id===optId;});
          if(!opt)return;
          var n=parseInt((opt.html||opt.text||'').replace(/<[^>]+>/g,'').trim());
          if(n<1||n>10)return;
          (po.preloaded_voters[optId]||[]).forEach(function(v){
            if(!uv[v.username])
              uv[v.username]={note:n,avatarUrl:base+(v.avatar_template||'').replace('{size}','40')};
          });
        });
      }

      // Distribution from API (authoritative)
      var dist=new Array(10).fill(0);
      po.options.forEach(function(o){
        var n=parseInt((o.html||o.text||'').replace(/<[^>]+>/g,'').trim());
        if(n>=1&&n<=10)dist[n-1]=o.votes||0;
      });
      var tot=dist.reduce(function(a,b){return a+b;},0);
      if(!tot)return;

      // Name: from DOM title, then API poll question, then short name
      var name=domData.gameName||extractName(po.question)||po.name;

      res.push({name:name,dist:dist,votes:tot,url:location.href,
        imageUrl:domData.imageUrl||null,userVotes:uv,serie:''});
    });

    if(!res.length){st('❌ Aucune donnée.');return;}
    var j=JSON.stringify(res);
    D.getElementById('_gkt').value=j;
    D.getElementById('_gko').style.display='block';
    var uvTotal=res.reduce(function(t,x){return t+Object.keys(x.userVotes).length;},0);
    var imgOk=res.filter(function(x){return x.imageUrl;}).length;
    st('✅ <b>'+res.length+' jeu(x)</b> · '+imgOk+' image(s) · '+uvTotal+' votes individuels');
    D.getElementById('_gkt').select();
    D.getElementById('_gkb').onclick=function(){
      D.getElementById('_gkt').select();
      try{D.execCommand('copy');}catch(e){navigator.clipboard.writeText(j).catch(function(){});}
      this.textContent='✓ Copié!';this.style.background='#48c78e';
      var btn=this;setTimeout(function(){btn.textContent='📋 Copier';btn.style.background='#7c6af0';},2200);
    };
  }catch(e){st('❌ '+e.message);}
}
run();
})();
