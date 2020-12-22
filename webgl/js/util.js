/** @template T @param {T[]} array */
module.exports.pick = array => array[~~(Math.random() * array.length)];

/**
* @param {WebGL2RenderingContext} gl
* @param {string} vs_src
* @param {string} fs_src
*/
module.exports.makeProgram = (gl, vs_src, fs_src) => {
   const vs = gl.createShader(gl.VERTEX_SHADER);
   const fs = gl.createShader(gl.FRAGMENT_SHADER);

   gl.shaderSource(vs, vs_src);
   gl.shaderSource(fs, fs_src);

   gl.compileShader(vs);
   gl.compileShader(fs);
   
   const prog = gl.createProgram();
   gl.attachShader(prog, vs);
   gl.attachShader(prog, fs);
   gl.linkProgram(prog);

   if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
        console.error(`vs info-log: ${gl.getShaderInfoLog(vs)}\n` +
                     `info-log: ${gl.getShaderInfoLog(fs)}`);
        throw new Error(`prog link failed: ${gl.getProgramInfoLog(prog)}`);
   }

   return prog;
}

const COLORS = [
    [255,0,0],
    [255,128,0],
    [255,255,0],
    [128,255,0],
    [0,255,0],
    [0,255,128],
    [0,255,255],
    [0,128,255],
    [127,0,255],
    [255,0,255],
    [255,0,127]].map(rgb => rgb.map(c => c / 255));

module.exports.getColor = id => COLORS[id % COLORS.length];