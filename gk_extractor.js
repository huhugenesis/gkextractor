(function(){
var base=location.origin,m=location.pathname.match(/\/(\d+)\/(\d+)\/?$/);
if(!m){alert("GK Extractor: navigue vers un post précis (URL .../topicId/postNumber).");return;}
var tid=m[1],pn=m[2],pni=parseInt(pn),D=document;
var ov=D.createElement('div');
ov.id='_gkx';
ov.style.cssText='position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;font-family:system-ui';
ov.innerHTML='<div style="background:#1e1e28;border:2px solid #7c6af0;border-radius:14px;padding:20px 24px;color:#e8e8f0;width:90%;max-width:480px"><b style="font-size:16px">🎮 GK Extractor</b><div id="_gks" style="color:#9898b0;margin:10px 0">…</div><div id="_gko" style="display:none"><textarea id="_gkt" style="width:100%;height:90px;background:#0f0f13;border:1px solid #7c6af0;color:#48c78e;border-radius:8px;padding:6px;font-size:10px;resize:vertical" readonly></textarea><div style="display:flex;gap:8px;margin-top:10px"><button id="_gkb" style="flex:1;background:#7c6af0;border:none;color:#fff;padding:9px;border-radius:7px;cursor:pointer;font-weight:700">📋 Copier</button><button onclick="document.getElementById(\'_gkx\').remove()" style="background:#26263a;border:1px solid #5a5a78;color:#e8e8f0;padding:9px 14px;border-radius:7px;cursor:pointer">Fermer</button></div></div><button onclick="document.getElementById(\'_gkx\').remove()" style="background:none;border:none;color:#5a5a78;cursor:pointer;font-size:12px;margin-top:6px">✕</button></div>';
D.body.appendChild(ov);

function st(x){D.getElementById('_gks').innerHTML=x;}

// Parse post HTML to build a map: pollName -> {imageUrl, gameName}
// Structure in cooked HTML: <img> then <div class="poll" data-poll-name="MK8D">
// The h1/h2 inside the poll div contains the question
function parsePostHTML(cooked, polls) {
  var tmp=D.createElement('div');
  tmp.innerHTML=cooked;

  // Build ordered list of top-level nodes to find image-before-poll pattern
  var nodes=Array.from(tmp.childNodes);
  var map={};

  // Also build a flat list of elements in document order
  var all=Array.from(tmp.querySelectorAll('*'));

  // For each poll div, find the preceding img
  var pollDivs=Array.from(tmp.querySelectorAll('[data-poll-name]'));

  pollDivs.forEach(function(pollDiv){
    var pname=pollDiv.getAttribute('data-poll-name');

    // Get game name from the h1 inside the poll div (Discourse renders # as h1)
    var h=pollDiv.querySelector('h1,h2,h3');
    var gameName=null;
    if(h){
      gameName=h.textContent.replace(/quelle note attribuez.vous [àa]\s*/i,'').replace(/\s*\?$/,'').trim();
    }
    // Fallback: check poll question from polls array
    if(!gameName||gameName.length<2){
      var po=polls.find(function(p){return p.name===pname;});
      if(po&&po.question){
        gameName=(po.question||'').replace(/<[^>]+>/g,'').replace(/quelle note attribuez.vous [àa]\s*/i,'').replace(/\s*\?$/,'').trim();
      }
    }

    // Find preceding image: walk backwards in DOM from this poll div
    var imageUrl=null;
    var el=pollDiv.previousElementSibling;
    // Search up to 5 siblings back
    var tries=0;
    while(el&&tries<5){
      var img=el.tagName==='IMG'?el:el.querySelector('img:not(.emoji):not(.avatar)');
      if(img){
        var s=img.getAttribute('src')||'';
        if(s.startsWith('//'))s='https:'+s;
        else if(s.startsWith('/'))s=base+s;
        if(s)imageUrl=s;
        break;
      }
      el=el.previousElementSibling;
      tries++;
    }

    map[pname]={gameName:gameName||null,imageUrl:imageUrl||null};
  });

  return map;
}

async function run(){
  try{
    st('Récupération du post…');
    var cred={credentials:'include'};
    var r=await fetch(base+'/forum/t/'+tid+'/'+pn+'.json',cred);
    if(!r.ok)throw new Error('HTTP '+r.status+' — connecté ?');
    var tp=await r.json();
    var posts=tp.post_stream&&tp.post_stream.posts||[];

    // Fetch posts adjacent to our target
    var ids=[pni-1,pni,pni+1,pni+2,pni+3];
    var qs=ids.map(function(i){return'post_ids[]='+i;}).join('&');
    var r2=await fetch(base+'/forum/t/'+tid+'/posts.json?'+qs,cred);
    if(r2.ok){
      var d2=await r2.json();
      var extra=d2.post_stream&&d2.post_stream.posts||[];
      extra.forEach(function(p){if(!posts.find(function(x){return x.id===p.id;}))posts.push(p);});
    }

    var pwp=posts.filter(function(p){return p.polls&&p.polls.length>0;});
    if(!pwp.length){st('❌ Aucun sondage trouvé. Vérifie l\'URL.');return;}
    st(pwp.length+' post(s) avec sondages…');

    var res=[];
    for(var pi=0;pi<pwp.length;pi++){
      var p=pwp[pi];
      // Parse HTML to map pollName -> {gameName, imageUrl}
      var htmlMap=parsePostHTML(p.cooked||'',p.polls);

      for(var poi=0;poi<p.polls.length;poi++){
        var po=p.polls[poi];
        st('Votes: '+po.name+' ('+( poi+1)+'/'+p.polls.length+')…');

        var info=htmlMap[po.name]||{};

        // Fetch voters per option
        var ov2={};
        for(var oi=0;oi<po.options.length;oi++){
          var o=po.options[oi];
          var vr=await fetch(base+'/forum/polls/voters.json?post_id='+p.id+'&poll_name='+po.name+'&option_id='+o.id+'&limit=500',cred);
          if(vr.ok){
            var vd=await vr.json();
            var voters=vd.voters&&vd.voters[o.id]||[];
            ov2[o.digest]=voters.map(function(v){
              return{username:v.username,avatarUrl:base+(v.avatar_template||'').replace('{size}','40')};
            });
          }
        }

        var dist=new Array(10).fill(0),uv={};
        for(var oi2=0;oi2<po.options.length;oi2++){
          var o2=po.options[oi2];
          var n=parseInt((o2.html||o2.text||'').replace(/<[^>]+>/g,'').trim());
          if(n>=1&&n<=10){
            dist[n-1]=o2.votes||0;
            (ov2[o2.digest]||[]).forEach(function(v){uv[v.username]={note:n,avatarUrl:v.avatarUrl};});
          }
        }
        var tot=dist.reduce(function(a,b){return a+b;},0);
        if(!tot)continue;

        // Game name: from HTML map, then poll.question, then fallback
        var name=info.gameName;
        if(!name&&po.question){
          name=(po.question||'').replace(/<[^>]+>/g,'').replace(/quelle note attribuez.vous [àa]\s*/i,'').replace(/\s*\?$/,'').trim();
        }
        if(!name||name.length<2)name=po.name; // use poll short name as last resort

        res.push({
          name:name,
          dist:dist,
          votes:tot,
          url:location.href,
          imageUrl:info.imageUrl||null,
          userVotes:uv,
          serie:''
        });
      }
    }

    if(!res.length){st('❌ Aucune donnée (sondage 1–10 attendu).');return;}
    var j=JSON.stringify(res);
    D.getElementById('_gkt').value=j;
    D.getElementById('_gko').style.display='block';
    st('✅ <b>'+res.length+' jeu(x)</b> · '+res.filter(function(x){return x.imageUrl;}).length+' image(s) · '+res.filter(function(x){return x.name!==x.name.toUpperCase();}).length+' noms OK');
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
