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

const shuffleArray = array => {
   for (var i = array.length - 1; i > 0; i--) {
       var j = Math.floor(Math.random() * (i + 1));
       var temp = array[i];
       array[i] = array[j];
       array[j] = temp;
   }
   return array;
}

module.exports.COLORS = shuffleArray([
   [0, 255, 148],
   [0, 246, 39],
   [255, 68, 67],
   [0, 240, 234],
   [255, 0, 98],
   [0, 169, 255],
   [255, 226, 0],
   [148, 0, 255],
   [196, 4, 78],
   [192, 255, 58],
   [255, 106, 228],
   [255, 142, 0]
]);