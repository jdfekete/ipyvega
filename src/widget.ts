import { DOMWidgetView, DOMWidgetModel } from "@jupyter-widgets/base";
import { vegaEmbed } from "./index";
import { Result } from "vega-embed";
import * as ndarray from "ndarray";
import { table_serialization, rowProxy, IDict } from "jupyter-tablewidgets";

interface WidgetUpdate {
  key: string;
  remove?: string;
  insert?: any[] | string;
}

interface WidgetUpdateMessage {
  type: "update";
  updates: WidgetUpdate[];
}

// validate the ev object and cast it to the correct type
function checkWidgetUpdate(ev: any): WidgetUpdateMessage | null {
  if (ev.type != "update") {
    return null;
  }

  // TODO: Fully validate ev and give a easy to understand error message if it is ill-formed
  return ev as WidgetUpdateMessage;
}

export class VegaWidgetModel extends DOMWidgetModel {
  defaults() {
        return {...DOMWidgetModel.prototype.defaults(),
            _model_name: "VegaWidgetModel",
            _view_name: "VegaWidget",
	    _model_module: 'jupyter-vega',
      	    _view_module: 'jupyter-vega',
      	    _model_module_version: '3.5.0',
      	    _view_module_version: '3.5.0',
            _spec_source: "",
            _opt_source: "",
            _df:  ndarray([]),
	    rec_time: [],
            _columns: []
            }
   };
  static serializers = {
        ...DOMWidgetModel.serializers,
        _df: table_serialization
    };

}

var transf_time: any = null;
var conv_time: any = null;

export class VegaWidget extends DOMWidgetView {
  result?: Result;
  viewElement = document.createElement("div");
  errorElement = document.createElement("div");
  async render() {
    this.el.appendChild(this.viewElement);
    this.errorElement.style.color = "red";
    this.el.appendChild(this.errorElement);
    const reembed = async () => {
      const spec = JSON.parse(this.model.get("_spec_source"));
      const opt = JSON.parse(this.model.get("_opt_source"));
      if (spec == null) {
        return;
      }

      try {
        const result = await vegaEmbed(this.viewElement, spec, {
          loader: { http: { credentials: "same-origin" } },
          ...opt,
        });
        if (this.result) {
          this.result.finalize();
        }
        this.result = result;
        this.send({ type: "display" });
      } catch (err) {
        if (this.result) {
          this.result.finalize();
        }
        console.error(err);
      }
    };

    const applyUpdate = async (update: WidgetUpdate) => {
      const result = this.result;
      if (result == null) {
        throw new Error("Internal error: no view attached to widget");
      }

      const filter = new Function(
        "datum",
        "return (" + (update.remove || "false") + ")"
      );
      let newValues = update.insert || [];
      transf_time = Date.now();
      conv_time = transf_time;
      if (newValues == "@dataframe") {
         // console.log("@dataframe");
         newValues = this.updateDataFrame();
	 conv_time = Date.now();
      } else if (newValues == "@array2d") {
         newValues = this.updateArray2D();
	 conv_time = Date.now();
      }
      
      const changeSet = result.view
        .changeset()
        .remove(filter)
        .insert(newValues);

      await result.view.change(update.key, changeSet).runAsync();
      this.model.set('rec_time', [transf_time, conv_time, Date.now()]);
      this.touch();

    };

    const applyUpdates = async (message: WidgetUpdateMessage) => {
      for (const update of message.updates) {
        await applyUpdate(update);
      }
    };
    this.model.on("change:_spec_source", reembed);
    this.model.on("change:_opt_source", reembed);
    this.model.on("msg:custom", (ev: any) => {
      const message = checkWidgetUpdate(ev);
      if (message == null) {
        return;
      }

      applyUpdates(message).catch((err: Error) => {
        this.errorElement.textContent = String(err);
        console.error(err);
      });
    });

    // initial rendering
    await reembed();
  }

  updateDataFrame(): any[] {
    let table = this.model.get("_df");
    transf_time = Date.now();
    // console.log("table", table);
    const proxy = rowProxy(table);
    const rows = Array(table.size);

    for (let i=0, n=rows.length; i<n; ++i) {
      rows[i] = proxy(i);
    }
    return rows;
    // for(let i=0; i < table.size; i++){
    //     let row: any = [];
    //     for (const col of table.columns){
    //         if(table.data[col].shape===undefined){
    //             row[col] = table.data[col][i];
    //         } else {
    //             row[col] = table.data[col].get(i);
    //         }
    //     }
    //     res[i] = row;
    // }
    // return res;
  };

  updateArray2D(): any[] {
    // console.log("updateArray2D");
    let table = this.model.get("_df");
    transf_time = Date.now();
    let res = Array(table.size*table.size);
    let fancyCol = table.columns[0];
    let arr: ndarray.NdArray = table.data[fancyCol];
    let cols: string[] = fancyCol.split(",");
    //let cols = this.model.get("_columns");
    let k = 0;
    for(let i=0; i<arr.shape[0];i++){
      for(let j=0; j< arr.shape[1]; j++){
        let row: IDict<Number> = {};
        row[cols[0]] = i;
        row[cols[1]] = j;
        row[cols[2]] = arr.get(i,j);
        res[k++] = row;
      }
    }
    return res;
  };
  
}

