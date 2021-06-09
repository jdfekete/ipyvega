const ctx: Worker = self as any;

function updateHistogram2D(arr: any, cols: any, shape: any): any[] {
  //console.log("shape", shape, typeof(shape));
  let res = [];
  for(let i=0; i<shape[0]; i++){
    for(let j=0; j< shape[1]; j++){
      let row = [];
      row[cols[0]] = i;
      row[cols[1]] = j;
      row[cols[2]] = arr[i][j];
      res.push(row);
    }
  }
  return res;
};

ctx.addEventListener("message", (event) => {
    //console.log("message", event.data);
    const arr = event.data.arr;
    const cols = event.data.cols;
    const shape = event.data.shape;
    const remove = event.data.remove;
    const values = updateHistogram2D(arr, cols, shape);
    ctx.postMessage({ values: values, remove: remove });
});