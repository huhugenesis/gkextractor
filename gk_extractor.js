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

// Gentle single scroll to bottom then back, to trigger lazy loading
function gentleScroll(){
  return new Promise(function(resolve){
    st('Chargement des sondages…');
    var total=D.body.scrollHeight;
    var step=Math.ceil(total/10);
    var pos=0;
    var count=0;
    function next(){
      pos+=step;
      window.scrollTo(0,pos);
      count++;
      if(count>=10||pos>=total){
        window.scrollTo(0,0);
        setTimeout(resolve,500);
      } else {
        setTimeout(next,150);
      }
    }
    next();
  });
}

// Read voter avatars from live DOM
// Discourse shows voters per option in .results li elements
function readDOMVoters(){
  var map={};
  var pollDivs=Array.from(D.querySelectorAll('.poll-outer[data-poll-name]'));
  pollDivs.forEach(function(pd){
    var pname=pd.getAttribute('data-poll-name');
    var uv={};
    // Each result row: contains the option number and voter avatars
    var rows=Array.from(pd.querySelectorAll('.results li, ul.results > li'));
    rows.forEach(function(li){
      // Option text = the note (1-10)
      var optEl=li.querySelector('.option span, .answer');
      var txt=optEl?optEl.textContent:li.childNodes[0]?li.childNodes[0].textContent:'';
      var note=parseInt((txt||'').trim());
      if(isNaN(note)||note<1||note>10)return;
      // Avatars of voters for this note
      var imgs=Array.from(li.querySelectorAll('img[src*="user_avatar"], img[src*="avatar_template"], img.avatar'));
      imgs.forEach(function(img){
        var username=(img.getAttribute('alt')||img.getAttribute('title')||'').replace(/^@/,'').trim();
        if(username&&!uv[username]){
          uv[username]={note:note,avatarUrl:img.src||''};
        }
      });
    });
    map[pname]=uv;
  });
  return map;
}

// Parse live DOM for game name and image
function parseLiveDOM(){
  var map={};
  D.querySelectorAll('.poll-outer[data-poll-name]').forEach(function(pd){
    var pname=pd.getAttribute('data-poll-name');
    var titleEl=pd.querySelector('.poll-title');
    var gameName=titleEl?extractName(titleEl.textContent):null;
    var imageUrl=null;
    var el=pd.previousElementSibling;
    var tries=0;
    while(el&&tries<6){
      var img=el.querySelector?el.querySelector('img:not(.emoji):not(.avatar)'):null;
      if(!img&&el.tagName==='IMG')img=el;
      if(img){
        var s=img.getAttribute('src')||'';
        if(s.startsWith('//'))s='https:'+s;
        else if(s.startsWith('/'))s=base+s;
        if(s){imageUrl=s;break;}
      }
      el=el.previousElementSibling;tries++;
    }
    map[pname]={gameName:gameName,imageUrl:imageUrl};
  });
  return map;
}

async function run(){
  try{
    // 1. Gentle scroll to load all polls
    await gentleScroll();

    var pollCount=D.querySelectorAll('.poll-outer[data-poll-name]').length;
    st(pollCount+' sondage(s) détecté(s)…');
    if(!pollCount){st('❌ Aucun sondage visible. Assure-toi d\'être sur le bon post.');return;}

    // 2. Read voters and metadata from live DOM
    var domVoters=readDOMVoters();
    var liveMap=parseLiveDOM();

    var domTotal=Object.values(domVoters).reduce(function(t,uv){return t+Object.keys(uv).length;},0);
    st('DOM: '+domTotal+' vote(s) lus — récupération API…');

    // 3. One single API call for the topic JSON (no per-option loops)
    var cred={credentials:'include'};
    var r=await fetch(base+'/forum/t/'+tid+'/'+pn+'.json',cred);
    if(!r.ok)throw new Error('HTTP '+r.status+' — connecté ?');
    var tp=await r.json();
    var posts=tp.post_stream&&tp.post_stream.posts||[];

    // One extra call for adjacent posts
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

    var res=[];
    for(var pi=0;pi<pwp.length;pi++){
      var p=pwp[pi];
      for(var poi=0;poi<p.polls.length;poi++){
        var po=p.polls[poi];
        var info=liveMap[po.name]||{};
        var total2=pwp.reduce(function(t,x){return t+x.polls.length;},0);
        st((res.length+1)+'/'+total2+' — '+(info.gameName||po.name)+'…');

        // Merge voters: DOM first (has real notes), then preloaded_voters as supplement
        var uv=Object.assign({},domVoters[po.name]||{});

        // Supplement with preloaded_voters from API payload
        if(po.preloaded_voters){
          Object.keys(po.preloaded_voters).forEach(function(optId){
            var opt=po.options.find(function(o){return o.id===optId;});
            if(!opt)return;
            var n=parseInt((opt.html||opt.text||'').replace(/<[^>]+>/g,'').trim());
            if(n<1||n>10)return;
            (po.preloaded_voters[optId]||[]).forEach(function(v){
              if(!uv[v.username]){
                uv[v.username]={note:n,avatarUrl:base+(v.avatar_template||'').replace('{size}','40')};
              }
            });
          });
        }

        // Build distribution from API options (authoritative counts)
        var dist=new Array(10).fill(0);
        po.options.forEach(function(o){
          var n=parseInt((o.html||o.text||'').replace(/<[^>]+>/g,'').trim());
          if(n>=1&&n<=10)dist[n-1]=o.votes||0;
        });
        var tot=dist.reduce(function(a,b){return a+b;},0);
        if(!tot)continue;

        res.push({
          name:info.gameName||po.name,
          dist:dist,votes:tot,
          url:location.href,
          imageUrl:info.imageUrl||null,
          userVotes:uv,
          serie:''
        });
      }
    }

    if(!res.length){st('❌ Aucune donnée.');return;}
    var j=JSON.stringify(res);
    D.getElementById('_gkt').value=j;
    D.getElementById('_gko').style.display='block';
    var imgOk=res.filter(function(x){return x.imageUrl;}).length;
    var uvTotal=res.reduce(function(t,x){return t+Object.keys(x.userVotes).length;},0);
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
