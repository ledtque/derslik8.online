// ==== d8QR: küçük, bağımsız QR kod üreteci (byte mode, EC seviyesi M, sürüm 1-10) ====
(function(global){
  var EC = { // [ecPerBlock, g1Blocks, g1Words, g2Blocks, g2Words]
    1:[10,1,16,0,0], 2:[16,1,28,0,0], 3:[26,1,44,0,0], 4:[18,2,32,0,0],
    5:[24,2,43,0,0], 6:[16,4,27,0,0], 7:[18,4,31,0,0], 8:[22,2,38,2,39],
    9:[22,3,36,2,37], 10:[26,4,43,1,44]
  };
  var CAP = {1:14,2:26,3:42,4:62,5:84,6:106,7:122,8:152,9:180,10:213};
  var ALIGN = {1:[],2:[6,18],3:[6,22],4:[6,26],5:[6,30],6:[6,34],
               7:[6,22,38],8:[6,24,42],9:[6,26,46],10:[6,28,50]};

  // Galois alanı tabloları
  var EXP=new Array(512), LOG=new Array(256);
  (function(){ var x=1; for(var i=0;i<255;i++){ EXP[i]=x; LOG[x]=i; x<<=1; if(x&256)x^=285; }
    for(var j=255;j<512;j++)EXP[j]=EXP[j-255]; })();
  function gmul(a,b){ return (a===0||b===0)?0:EXP[LOG[a]+LOG[b]]; }

  function rsPoly(n){
    var poly=[1];
    for(var i=0;i<n;i++){
      var next=new Array(poly.length+1).fill(0);
      for(var j=0;j<poly.length;j++){
        next[j]^=gmul(poly[j],1);
        next[j+1]^=gmul(poly[j],EXP[i]);
      }
      poly=next;
    }
    return poly;
  }
  function rsEncode(data,ecLen){
    var gen=rsPoly(ecLen), res=new Array(ecLen).fill(0);
    for(var i=0;i<data.length;i++){
      var factor=data[i]^res[0];
      res.shift(); res.push(0);
      for(var j=0;j<ecLen;j++) res[j]^=gmul(gen[j+1],factor);
    }
    return res;
  }

  function toBytes(str){
    var out=[], s=unescape(encodeURIComponent(str));
    for(var i=0;i<s.length;i++) out.push(s.charCodeAt(i)&255);
    return out;
  }

  function build(text){
    var bytes=toBytes(text), ver=0;
    for(var v=1;v<=10;v++){ if(bytes.length<=CAP[v]){ ver=v; break; } }
    if(!ver) throw new Error('QR: metin çok uzun');

    var lenBits = ver<10 ? 8 : 16;
    var bits=[];
    function put(val,n){ for(var i=n-1;i>=0;i--) bits.push((val>>i)&1); }
    put(4,4); put(bytes.length,lenBits);
    for(var i=0;i<bytes.length;i++) put(bytes[i],8);

    var e=EC[ver];
    var totalData = e[1]*e[2] + e[3]*e[4];
    var cap = totalData*8;
    put(0, Math.min(4, cap-bits.length));
    while(bits.length%8) bits.push(0);
    var dataWords=[];
    for(var b=0;b<bits.length;b+=8){
      var byte=0; for(var k=0;k<8;k++) byte=(byte<<1)|bits[b+k];
      dataWords.push(byte);
    }
    var pad=[236,17], p=0;
    while(dataWords.length<totalData){ dataWords.push(pad[p++%2]); }

    // Blokları ayır, her bloğa EC hesapla
    var blocks=[], ecBlocks=[], pos=0, bi;
    for(bi=0;bi<e[1];bi++){ blocks.push(dataWords.slice(pos,pos+e[2])); pos+=e[2]; }
    for(bi=0;bi<e[3];bi++){ blocks.push(dataWords.slice(pos,pos+e[4])); pos+=e[4]; }
    for(bi=0;bi<blocks.length;bi++) ecBlocks.push(rsEncode(blocks[bi],e[0]));

    // Serpiştir
    var final=[], maxLen=Math.max(e[2],e[4]), c;
    for(c=0;c<maxLen;c++) for(bi=0;bi<blocks.length;bi++) if(c<blocks[bi].length) final.push(blocks[bi][c]);
    for(c=0;c<e[0];c++) for(bi=0;bi<ecBlocks.length;bi++) final.push(ecBlocks[bi][c]);

    return { version:ver, words:final };
  }

  function matrix(ver, words){
    var size=ver*4+17;
    var m=[], reserved=[], r, c;
    for(r=0;r<size;r++){ m.push(new Array(size).fill(0)); reserved.push(new Array(size).fill(0)); }

    function finder(row,col){
      for(var r2=-1;r2<=7;r2++) for(var c2=-1;c2<=7;c2++){
        var rr=row+r2, cc=col+c2;
        if(rr<0||rr>=size||cc<0||cc>=size) continue;
        var inBox = (r2>=0&&r2<=6&&(c2===0||c2===6)) || (c2>=0&&c2<=6&&(r2===0||r2===6)) || (r2>=2&&r2<=4&&c2>=2&&c2<=4);
        m[rr][cc]= inBox?1:0; reserved[rr][cc]=1;
      }
    }
    finder(0,0); finder(0,size-7); finder(size-7,0);

    // Zamanlama şeritleri
    for(var i=8;i<size-8;i++){
      m[6][i]=(i%2===0)?1:0; reserved[6][i]=1;
      m[i][6]=(i%2===0)?1:0; reserved[i][6]=1;
    }
    // Hizalama desenleri
    var al=ALIGN[ver];
    for(var a=0;a<al.length;a++) for(var b=0;b<al.length;b++){
      var ar=al[a], ac=al[b];
      if((ar<=8&&ac<=8)||(ar<=8&&ac>=size-9)||(ar>=size-9&&ac<=8)) continue;
      for(var dr=-2;dr<=2;dr++) for(var dc=-2;dc<=2;dc++){
        m[ar+dr][ac+dc]=(Math.max(Math.abs(dr),Math.abs(dc))!==1)?1:0;
        reserved[ar+dr][ac+dc]=1;
      }
    }
    // Karanlık modül + format alanları
    m[size-8][8]=1; reserved[size-8][8]=1;
    for(i=0;i<9;i++){ if(!reserved[8][i]){reserved[8][i]=1;} if(!reserved[i][8]){reserved[i][8]=1;} }
    for(i=0;i<8;i++){ reserved[8][size-1-i]=1; reserved[size-1-i][8]=1; }
    // Sürüm bilgisi alanı (7 ve üzeri)
    if(ver>=7){
      for(i=0;i<6;i++) for(var j=0;j<3;j++){
        reserved[i][size-11+j]=1; reserved[size-11+j][i]=1;
      }
    }

    // Veri bitlerini zigzag yerleştir
    var bitIdx=0, total=words.length*8;
    function bitAt(n){ return n<total ? (words[n>>3]>>(7-(n&7)))&1 : 0; }
    var up=true;
    for(var col=size-1;col>0;col-=2){
      if(col===6) col--;
      for(var k=0;k<size;k++){
        var row = up ? (size-1-k) : k;
        for(var t=0;t<2;t++){
          var cc2=col-t;
          if(reserved[row][cc2]) continue;
          m[row][cc2]=bitAt(bitIdx++);
        }
      }
      up=!up;
    }
    return {m:m, reserved:reserved, size:size};
  }

  function maskFn(n,r,c){
    switch(n){
      case 0: return (r+c)%2===0;
      case 1: return r%2===0;
      case 2: return c%3===0;
      case 3: return (r+c)%3===0;
      case 4: return (Math.floor(r/2)+Math.floor(c/3))%2===0;
      case 5: return (r*c)%2+(r*c)%3===0;
      case 6: return ((r*c)%2+(r*c)%3)%2===0;
      case 7: return ((r+c)%2+(r*c)%3)%2===0;
    }
  }

  

  function formatBits(mask){
    // EC seviyesi M => 00
    var data=(0<<3)|mask;
    var v=data<<10;
    for(var i=14;i>=10;i--) if((v>>i)&1) v^=0x537<<(i-10);
    return ((data<<10)|v)^0x5412;
  }
  function versionBits(ver){
    var v=ver<<12;
    for(var i=17;i>=12;i--) if((v>>i)&1) v^=0x1F25<<(i-12);
    return (ver<<12)|v;
  }

  function applyMask(base, mask){
    var size=base.size, m=[], r, c;
    for(r=0;r<size;r++){ m.push(base.m[r].slice()); }
    for(r=0;r<size;r++) for(c=0;c<size;c++){
      if(!base.reserved[r][c] && maskFn(mask,r,c)) m[r][c]^=1;
    }
    // Format bitleri
    var fb=formatBits(mask);
    for(var i=0;i<15;i++){
      var bit=(fb>>i)&1;
      // dikey (sol üst) + yatay
      if(i<6) m[i][8]=bit;
      else if(i===6) m[7][8]=bit;
      else if(i===7) m[8][8]=bit;
      else if(i===8) m[8][7]=bit;
      else m[8][14-i]=bit;

      if(i<8) m[8][size-1-i]=bit;
      else m[size-15+i][8]=bit;
    }
    m[size-8][8]=1;
    return m;
  }

  function addVersionInfo(m,ver,size){
    if(ver<7) return;
    var vb=versionBits(ver);
    for(var i=0;i<18;i++){
      var bit=(vb>>i)&1;
      var r=Math.floor(i/3), c=size-11+(i%3);
      m[r][c]=bit; m[c][r]=bit;
    }
  }

  function penalty(m,size){
    var score=0, r, c, i;
    // Kural 1: aynı renkte 5+ ardışık
    for(var dir=0;dir<2;dir++){
      for(r=0;r<size;r++){
        var run=1, prev=-1;
        for(c=0;c<size;c++){
          var v = dir===0 ? m[r][c] : m[c][r];
          if(v===prev) run++; else { if(run>=5) score+=3+(run-5); run=1; prev=v; }
        }
        if(run>=5) score+=3+(run-5);
      }
    }
    // Kural 2: 2x2 bloklar
    for(r=0;r<size-1;r++) for(c=0;c<size-1;c++){
      var v0=m[r][c];
      if(v0===m[r][c+1]&&v0===m[r+1][c]&&v0===m[r+1][c+1]) score+=3;
    }
    // Kural 3: 1:1:3:1:1 deseni
    var pat=[1,0,1,1,1,0,1,0,0,0,0], pat2=[0,0,0,0,1,0,1,1,1,0,1];
    function check(arr,off,p){
      for(var k=0;k<11;k++) if(arr[off+k]!==p[k]) return false;
      return true;
    }
    for(r=0;r<size;r++){
      var row=m[r], col=[];
      for(i=0;i<size;i++) col.push(m[i][r]);
      for(c=0;c+11<=size;c++){
        if(check(row,c,pat)||check(row,c,pat2)) score+=40;
        if(check(col,c,pat)||check(col,c,pat2)) score+=40;
      }
    }
    // Kural 4: koyu oranı
    var dark=0;
    for(r=0;r<size;r++) for(c=0;c<size;c++) if(m[r][c]) dark++;
    var pct=dark*100/(size*size);
    score += Math.floor(Math.abs(pct-50)/5)*10;
    return score;
  }

  function generate(text){
    var enc=build(text);
    var base=matrix(enc.version, enc.words);
    var best=null, bestScore=Infinity;
    for(var mask=0;mask<8;mask++){
      var m=applyMask(base,mask);
      addVersionInfo(m,enc.version,base.size);
      var s=penalty(m,base.size);
      if(s<bestScore){ bestScore=s; best=m; }
    }
    return { size:base.size, modules:best, version:enc.version };
  }

  // SVG çıktısı
  function svg(text, opts){
    opts=opts||{};
    var qr=generate(text);
    var quiet = opts.quiet==null?4:opts.quiet;
    var n=qr.size, total=n+quiet*2;
    var dark=opts.dark||'#0F3B3A', light=opts.light||'#FFFFFF';
    var path='';
    for(var r=0;r<n;r++){
      for(var c=0;c<n;c++){
        if(qr.modules[r][c]) path+='M'+(c+quiet)+' '+(r+quiet)+'h1v1h-1z';
      }
    }
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 '+total+' '+total+'" shape-rendering="crispEdges" width="100%" height="100%">'+
      '<rect width="'+total+'" height="'+total+'" fill="'+light+'"/>'+
      '<path d="'+path+'" fill="'+dark+'"/></svg>';
  }

  global.d8QR = { generate:generate, svg:svg };
})(typeof window!=='undefined'?window:global);
