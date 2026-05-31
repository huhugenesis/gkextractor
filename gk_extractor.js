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

function getImgUrl(el){
  var img=el.querySelector('img:not(.emoji):not(.avatar)');
  if(!img)return null;
  var s=img.getAttribute('src')||'';
  if(s.startsWith('//'))s='https:'+s;
  else if(s.startsWith('/'))s=base+s;
  return s||null;
}

// Parse the LIVE DOM of the current page (not cooked HTML)
// Finds poll containers and their preceding images directly in the page
function parseLiveDOM(postNumber){
  // Find all poll-outer divs in the page
  var pollDivs=Array.from(D.querySelectorAll('.poll-outer[data-poll-name]'));
  var map={};

  pollDivs.forEach(function(pollDiv){
    var pname=pollDiv.getAttribute('data-poll-name');

    // Game name from div.poll-title inside this poll
    var titleEl=pollDiv.querySelector('.poll-title');
    var gameName=titleEl?extractName(titleEl.textContent):null;

    // Find preceding image: walk back through siblings
    var imageUrl=null;
    var el=pollDiv.previousElementSibling;
    var tries=0;
    while(el&&tries<6){
      // Discourse wraps images in div.lightbox-wrapper
      var url=getImgUrl(el);
      if(url){imageUrl=url;break;}
      el=el.previousElementSibling;
      tries++;
    }

    map[pname]={gameName:gameName,imageUrl:imageUrl};
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

    var ids=[pni-1,pni,pni+1,pni+2,pni+3];
    var r2=await fetch(base+'/forum/t/'+tid+'/posts.json?'+ids.map(function(i){return'post_ids[]='+i;}).join('&'),cred);
    if(r2.ok){
      var d2=await r2.json();
      (d2.post_stream&&d2.post_stream.posts||[]).forEach(function(p){
        if(!posts.find(function(x){return x.id===p.id;}))posts.push(p);
      });
    }

    var pwp=posts.filter(function(p){return p.polls&&p.polls.length>0;});
    if(!pwp.length){st('❌ Aucun sondage trouvé.');return;}

    // Use live DOM to get names and images (much more reliable than cooked HTML)
    var liveMap=parseLiveDOM();
    st('DOM analysé · '+Object.keys(liveMap).length+' sondage(s) trouvé(s)…');

    var res=[];
    for(var pi=0;pi<pwp.length;pi++){
      var p=pwp[pi];
      for(var poi=0;poi<p.polls.length;poi++){
        var po=p.polls[poi];
        var info=liveMap[po.name]||{};
        st('Votes: '+(poi+1)+'/'+p.polls.length+' — '+(info.gameName||po.name)+'…');

        var ov2={};
        for(var oi=0;oi<po.options.length;oi++){
          var o=po.options[oi];
          var vr=await fetch(base+'/forum/polls/voters.json?post_id='+p.id+'&poll_name='+po.name+'&option_id='+o.id+'&limit=500',cred);
          if(vr.ok){
            var vd=await vr.json();
            (vd.voters&&vd.voters[o.id]||[]).forEach(function(v){
              if(!ov2[o.digest])ov2[o.digest]=[];
              ov2[o.digest].push({username:v.username,avatarUrl:base+(v.avatar_template||'').replace('{size}','40')});
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

        res.push({
          name:info.gameName||po.name,
          dist:dist,votes:tot,
          url:location.href,
          imageUrl:info.imageUrl||null,
          userVotes:uv,serie:''
        });
      }
    }

    if(!res.length){st('❌ Aucune donnée.');return;}
    var j=JSON.stringify(res);
    D.getElementById('_gkt').value=j;
    D.getElementById('_gko').style.display='block';
    var imgOk=res.filter(function(x){return x.imageUrl;}).length;
    var nameOk=res.filter(function(x){return x.name&&x.name.indexOf(' ')>0;}).length;
    st('✅ <b>'+res.length+' jeu(x)</b> · '+imgOk+' image(s) · '+nameOk+'/'+res.length+' noms complets');
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
