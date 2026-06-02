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

function scrollToLoad(){
  return new Promise(function(resolve){
    st('Scroll pour charger les sondages…');
    var attempts=0;
    function step(){
      window.scrollBy(0,600);
      attempts++;
      if(attempts>=20){window.scrollTo(0,0);setTimeout(resolve,600);return;}
      setTimeout(step,200);
    }
    step();
  });
}

// Expand all poll voter lists to show all voters (click "show more" buttons)
function expandAllPolls(){
  return new Promise(function(resolve){
    st('Expansion des listes de votants…');
    // Click all "show more" / expand buttons in polls
    var btns=Array.from(D.querySelectorAll('.poll-voters-toggle, .discourse-poll-voters-toggle, [data-action="toggleStatus"], .btn-flat'));
    btns.forEach(function(btn){
      try{ btn.click(); }catch(e){}
    });
    setTimeout(resolve, 800);
  });
}

// Read voters directly from the live DOM of the page
// Discourse renders poll voters as: div.poll-voters > ul > li > a[data-user-card] > img
// Each note option has a div with the note value and a list of voter avatars
function readVotersFromDOM(){
  var pollDivs=Array.from(D.querySelectorAll('.poll-outer[data-poll-name]'));
  var map={};

  pollDivs.forEach(function(pollDiv){
    var pname=pollDiv.getAttribute('data-poll-name');
    var uv={};

    // Each option in the poll
    // Discourse structure: .poll-container > .discourse-poll-container
    // Options: li[data-poll-option-id] or .poll-option
    // Voters under each option: .poll-voters or similar

    // Try multiple selectors for option containers
    var optionContainers=Array.from(pollDiv.querySelectorAll('li[data-poll-option-id], .poll-option'));
    
    if(optionContainers.length===0){
      // Alternative: look for the results section
      // In results view: rows showing note + voter avatars
      var rows=Array.from(pollDiv.querySelectorAll('.poll-results-row, .discourse-poll-row'));
      rows.forEach(function(row){
        // Get the note value from this row
        var noteEl=row.querySelector('.poll-answer-percentage, .discourse-poll-percentage, .choice');
        // Try to find the note number
        var allText=row.textContent;
        var noteMatch=allText.match(/^(\d+)/);
        if(!noteMatch)return;
        var note=parseInt(noteMatch[1]);
        if(note<1||note>10)return;
        
        // Get voter avatars in this row
        var imgs=Array.from(row.querySelectorAll('img[src*="avatar"], img[src*="user_avatar"], img[alt]'));
        imgs.forEach(function(img){
          var username=img.getAttribute('alt')||img.getAttribute('title')||'';
          if(username&&note>=1&&note<=10){
            uv[username]={note:note,avatarUrl:img.src||''};
          }
        });
      });
    }

    // Main approach: find option rows with voter lists
    // Discourse poll results structure:
    // .poll-results-chart or .poll-results > li > .percentage + .poll-voters
    var resultItems=Array.from(pollDiv.querySelectorAll('.results li, .poll-results li, li.chosen'));
    resultItems.forEach(function(li){
      // Get the note/option text
      var optText=(li.querySelector('.option span:first-child, .poll-option-vote')||li).textContent.trim();
      var note=parseInt(optText);
      if(isNaN(note)||note<1||note>10)return;

      // Get voters shown for this option
      var imgs=Array.from(li.querySelectorAll('img[src*="user_avatar"], img[src*="avatar"]'));
      imgs.forEach(function(img){
        var username=img.getAttribute('alt')||img.getAttribute('title')||'';
        username=username.replace(/^@/,'').trim();
        if(username&&username.length>0){
          uv[username]={note:note,avatarUrl:img.src||''};
        }
      });
    });

    map[pname]={userVotes:uv};
  });
  return map;
}

function getImg(h){
  var t=D.createElement('div');t.innerHTML=h;
  var i=t.querySelector('img:not(.emoji):not(.avatar)');
  if(!i)return null;
  var s=i.getAttribute('src')||'';
  if(s.startsWith('//'))s='https:'+s;
  else if(s.startsWith('/'))s=base+s;
  return s||null;
}

async function run(){
  try{
    // Scroll to load all polls
    await scrollToLoad();
    // Try to expand voter lists
    await expandAllPolls();

    var pollCount=D.querySelectorAll('.poll-outer[data-poll-name]').length;
    st(pollCount+' sondage(s) dans le DOM…');

    // Read voters from DOM FIRST (before API calls change anything)
    var domVoters=readVotersFromDOM();
    var domVoterCount=Object.values(domVoters).reduce(function(t,p){return t+Object.keys(p.userVotes).length;},0);
    st('DOM: '+domVoterCount+' vote(s) lus — récupération API…');

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

    // Parse live DOM for names and images
    var liveMap={};
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
      liveMap[pname]={gameName:gameName,imageUrl:imageUrl};
    });

    var res=[];
    for(var pi=0;pi<pwp.length;pi++){
      var p=pwp[pi];
      for(var poi=0;poi<p.polls.length;poi++){
        var po=p.polls[poi];
        var info=liveMap[po.name]||{};
        st((res.length+1)+'/'+pwp.reduce(function(t,x){return t+x.polls.length;},0)+' — '+(info.gameName||po.name)+'…');

        // Start with DOM voters (most complete source)
        var uv=(domVoters[po.name]&&domVoters[po.name].userVotes)||{};

        // Also try preloaded_voters from API for any notes not covered by DOM
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

        // Try polls/voters.json for text-named polls
        if(isNaN(parseInt(po.name))){
          for(var oi=0;oi<po.options.length;oi++){
            var o=po.options[oi];
            var n2=parseInt((o.html||o.text||'').replace(/<[^>]+>/g,'').trim());
            if(n2<1||n2>10)continue;
            try{
              var vr=await fetch(base+'/forum/polls/voters.json?post_id='+p.id+'&poll_name='+encodeURIComponent(po.name)+'&option_id='+o.id+'&limit=500',cred);
              if(vr.ok){
                var vd=await vr.json();
                (vd.voters&&vd.voters[o.id]||[]).forEach(function(v){
                  if(!uv[v.username]){
                    uv[v.username]={note:n2,avatarUrl:base+(v.avatar_template||'').replace('{size}','40')};
                  }
                });
              }
            }catch(e){}
          }
        }

        var dist=new Array(10).fill(0);
        for(var oi2=0;oi2<po.options.length;oi2++){
          var o2=po.options[oi2];
          var n3=parseInt((o2.html||o2.text||'').replace(/<[^>]+>/g,'').trim());
          if(n3>=1&&n3<=10)dist[n3-1]=o2.votes||0;
        }
        var tot=dist.reduce(function(a,b){return a+b;},0);
        if(!tot)continue;

        res.push({name:info.gameName||po.name,dist:dist,votes:tot,url:location.href,imageUrl:info.imageUrl||null,userVotes:uv,serie:''});
      }
    }

    if(!res.length){st('❌ Aucune donnée.');return;}
    var j=JSON.stringify(res);
    D.getElementById('_gkt').value=j;
    D.getElementById('_gko').style.display='block';
    var imgOk=res.filter(function(x){return x.imageUrl;}).length;
    var uvTotal=res.reduce(function(t,x){return t+Object.keys(x.userVotes).length;},0);
    var uvOk=res.filter(function(x){return Object.keys(x.userVotes).length>0;}).length;
    st('✅ <b>'+res.length+' jeu(x)</b> · '+imgOk+' image(s) · '+uvTotal+' votes individuels ('+uvOk+'/'+res.length+' jeux)');
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
