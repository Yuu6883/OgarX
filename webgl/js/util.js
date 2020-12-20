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

   if (!gl.getShaderParameter(vs, gl.COMPILE_STATUS) || !gl.getShaderParameter(fs, gl.COMPILE_STATUS)) {
       console.error(`vs info-log: ${gl.getShaderInfoLog(vs)}\n` +
                     `info-log: ${gl.getShaderInfoLog(fs)}`);
       gl.deleteShader(vs);
       gl.deleteShader(fs);
       return;
   }

   const prog = gl.createProgram();
   gl.attachShader(prog, vs);
   gl.attachShader(prog, fs);
   gl.linkProgram(prog);

   if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
        gl.deleteProgram(prog);
       throw new Error(`prog link failed: ${gl.getProgramInfoLog(prog)}`);
   }

   return prog;
}

module.exports.Mat3 = {
    mul: (a, b) => {
        const a00 = a[0 * 3 + 0];
        const a01 = a[0 * 3 + 1];
        const a02 = a[0 * 3 + 2];
        const a10 = a[1 * 3 + 0];
        const a11 = a[1 * 3 + 1];
        const a12 = a[1 * 3 + 2];
        const a20 = a[2 * 3 + 0];
        const a21 = a[2 * 3 + 1];
        const a22 = a[2 * 3 + 2];
        const b00 = b[0 * 3 + 0];
        const b01 = b[0 * 3 + 1];
        const b02 = b[0 * 3 + 2];
        const b10 = b[1 * 3 + 0];
        const b11 = b[1 * 3 + 1];
        const b12 = b[1 * 3 + 2];
        const b20 = b[2 * 3 + 0];
        const b21 = b[2 * 3 + 1];
        const b22 = b[2 * 3 + 2];
    
        return [
            b00 * a00 + b01 * a10 + b02 * a20,
            b00 * a01 + b01 * a11 + b02 * a21,
            b00 * a02 + b01 * a12 + b02 * a22,
            b10 * a00 + b11 * a10 + b12 * a20,
            b10 * a01 + b11 * a11 + b12 * a21,
            b10 * a02 + b11 * a12 + b12 * a22,
            b20 * a00 + b21 * a10 + b22 * a20,
            b20 * a01 + b21 * a11 + b22 * a21,
            b20 * a02 + b21 * a12 + b22 * a22,
        ];
    },
    translate: (x, y) => {
        return [
            1, 0, 0,
            0, 1, 0,
            x, y, 1,
        ];
    },
    scale: (sx, sy) => {
        return [
            sx, 0, 0,
            0, sy, 0,
            0,  0, 1,
        ];
    },
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

console.log(COLORS);

module.exports.getColor = id => COLORS[id % COLORS.length];