export function mountShaderBackground(): () => void {
  const canvas = document.createElement("canvas");
  canvas.setAttribute("aria-hidden", "true");
  canvas.style.cssText =
    "position:fixed;inset:0;width:100%;height:100%;z-index:-1;pointer-events:none;";
  document.body.prepend(canvas);

  const gl = canvas.getContext("webgl", {
    antialias: false,
    alpha: false,
    depth: false,
    stencil: false,
    preserveDrawingBuffer: true,
    powerPreference: "low-power",
  }) as WebGLRenderingContext | null;
  if (!gl) {
    canvas.remove();
    return () => {};
  }

  const VERT = "attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}";
  const FRAG = [
    "precision mediump float;",
    "uniform vec2 u_res;",
    "uniform float u_time;",
    "uniform vec3 u_base;",
    "uniform vec3 u_a;",
    "uniform vec3 u_b;",
    "uniform vec3 u_c;",
    "float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}",
    "float noise(vec2 p){vec2 i=floor(p);vec2 f=fract(p);vec2 u=f*f*(3.-2.*f);",
    "return mix(mix(hash(i),hash(i+vec2(1.,0.)),u.x),mix(hash(i+vec2(0.,1.)),hash(i+vec2(1.,1.)),u.x),u.y);}",
    "float fbm(vec2 p){float v=0.;float a=.5;for(int i=0;i<4;i++){v+=a*noise(p);p=p*2.03+vec2(17.3,9.1);a*=.5;}return v;}",
    "void main(){",
    "vec2 uv=vec2(gl_FragCoord.x/u_res.x,1.-gl_FragCoord.y/u_res.y);",
    "vec2 asp=vec2(u_res.x/u_res.y,1.);",
    "vec2 p=uv*asp;",
    "float t=u_time*.045;",
    "vec2 q=vec2(fbm(p*1.4+t*.7),fbm(p*1.4-vec2(.3,.0)-t*.5));",
    "vec2 r=vec2(fbm(p*1.4+2.6*q+vec2(1.7,9.2)+t*.3),fbm(p*1.4+2.6*q+vec2(8.3,2.8)-t*.25));",
    "float f1=fbm(p*1.6+2.2*r+t*.4);",
    "float f2=fbm(p*1.2-1.8*q-t*.3);",
    "float glow=smoothstep(.9,-.1,length((uv-vec2(.06,-.06))*vec2(1.,1.4)));",
    "float cool=smoothstep(1.1,.0,length((uv-vec2(.95,.15))*vec2(1.1,1.)));",
    "float deep=smoothstep(.15,1.05,uv.y);",
    "vec3 col=u_base;",
    "col+=u_a*(.35+.65*f1)*(.35+.65*glow);",
    "col+=u_b*(.30+.70*f2)*(.30+.70*cool);",
    "col+=u_c*.35*(.4+.6*r.x);",
    "col*=1.-.28*deep*deep;",
    "col+=(hash(gl_FragCoord.xy)-.5)*.028;",
    "gl_FragColor=vec4(col,1.);",
    "}",
  ].join("\n");

  function shader(type: number, src: string) {
    const s = gl!.createShader(type)!;
    gl!.shaderSource(s, src);
    gl!.compileShader(s);
    if (!gl!.getShaderParameter(s, gl!.COMPILE_STATUS)) {
      gl!.deleteShader(s);
      return null;
    }
    return s;
  }

  const vs = shader(gl.VERTEX_SHADER, VERT);
  const fs = shader(gl.FRAGMENT_SHADER, FRAG);
  if (!vs || !fs) {
    canvas.remove();
    return () => {};
  }
  const prog = gl.createProgram()!;
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    canvas.remove();
    return () => {};
  }
  gl.useProgram(prog);

  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, "p");
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

  const uRes = gl.getUniformLocation(prog, "u_res");
  const uTime = gl.getUniformLocation(prog, "u_time");
  const uBase = gl.getUniformLocation(prog, "u_base");
  const uA = gl.getUniformLocation(prog, "u_a");
  const uB = gl.getUniformLocation(prog, "u_b");
  const uC = gl.getUniformLocation(prog, "u_c");

  type Palette = [number, number, number][];
  const DARK: Palette = [
    [0.023, 0.023, 0.043],
    [0.115, 0.082, 0.038],
    [0.095, 0.02, 0.032],
    [0.045, 0.075, 0.11],
  ];
  const LIGHT: Palette = [
    [0.905, 0.875, 0.79],
    [0.235, 0.155, 0.06],
    [0.16, 0.07, 0.05],
    [0.1, 0.14, 0.17],
  ];

  function themePalette(): Palette {
    return document.documentElement.getAttribute("data-theme") === "light" ? LIGHT : DARK;
  }

  let from = themePalette();
  let to = from;
  let blend = 1;

  const observer = new MutationObserver(() => {
    from = current();
    to = themePalette();
    blend = 0;
  });
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

  function current(): Palette {
    return [0, 1, 2, 3].map((i) => [
      from[i][0] + (to[i][0] - from[i][0]) * blend,
      from[i][1] + (to[i][1] - from[i][1]) * blend,
      from[i][2] + (to[i][2] - from[i][2]) * blend,
    ]) as Palette;
  }

  function resize() {
    const scale = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(2, Math.round((window.innerWidth * scale) / 3));
    const h = Math.max(2, Math.round((window.innerHeight * scale) / 3));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
      gl!.viewport(0, 0, w, h);
    }
  }

  const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let raf = 0;
  let last = 0;
  let elapsed = 8;
  let dead = false;

  function frame(now: number) {
    if (dead) return;
    raf = requestAnimationFrame(frame);
    if (now - last < 33) return;
    last = now;
    if (blend < 1) blend = Math.min(1, blend + 0.03);
    elapsed += 0.033;
    draw();
  }

  function draw() {
    resize();
    const pal = current();
    gl!.uniform2f(uRes, canvas.width, canvas.height);
    gl!.uniform1f(uTime, elapsed);
    gl!.uniform3f(uBase, pal[0][0], pal[0][1], pal[0][2]);
    gl!.uniform3f(uA, pal[1][0], pal[1][1], pal[1][2]);
    gl!.uniform3f(uB, pal[2][0], pal[2][1], pal[2][2]);
    gl!.uniform3f(uC, pal[3][0], pal[3][1], pal[3][2]);
    gl!.drawArrays(gl!.TRIANGLES, 0, 3);
  }

  window.addEventListener("resize", resize);
  draw();
  if (!still) raf = requestAnimationFrame(frame);

  return () => {
    dead = true;
    cancelAnimationFrame(raf);
    observer.disconnect();
    window.removeEventListener("resize", resize);
    canvas.remove();
  };
}
