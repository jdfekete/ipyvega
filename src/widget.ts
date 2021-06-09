import { DOMWidgetView, DOMWidgetModel } from "@jupyter-widgets/base";
import { vegaEmbed } from "./index";
import { Result } from "vega-embed";
import * as ndarray from "ndarray";
import * as ndarray_unpack from "ndarray-unpack";

import Histogram2DWorker from "worker-loader!./worker";


var vegaWidget_ = null as any;

const worker = new Histogram2DWorker();


worker.onmessage = async (event: any) => {
    const filter = new Function(
        "datum",
        "return (" + (event.data.remove || "false") + ")"
      );
    const result =  vegaWidget_.result;
    const changeSet = result.view
        .changeset()
	.remove(filter)
        .insert(event.data.values);
    await result.view.change("data", changeSet).runAsync();
};


import {
  data_union_serialization,
  listenToUnion,
} from 'jupyter-dataserializers';

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
	    _model_name: "VegaWidgetModule",
            _view_name: "VegaWidget",
	    _spec_source: "",
	    _opt_source: "",
	    _df:  ndarray([]),
	    _columns: []
	    }
   };
  static serializers = {
        ...DOMWidgetModel.serializers,
        _df: data_union_serialization
    };

}

export class VegaWidget extends DOMWidgetView {
  result?: Result;
  viewElement = document.createElement("div");
  errorElement = document.createElement("div");
  async render() {
    this.el.appendChild(this.viewElement);
    this.errorElement.style.color = "red";
    this.el.appendChild(this.errorElement);
    const reembed = async () => {
      listenToUnion(this.model, '_df', this.update.bind(this), true);
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
      if (newValues == "@dataframe") {
	 newValues = this.updateDataFrame();
      } else if (newValues == "@histogram2d") {
	 //newValues = this.updateHistogram2D();
	 vegaWidget_ = this;
	 const df = this.model.get("_df");
	 const arr = ndarray_unpack(df);
	 const cols = this.model.get("_columns");
	 worker.postMessage({ arr: arr,
	                cols: cols, shape: df.shape, remove: update.remove });
	 return;
      }
      const changeSet = result.view
        .changeset()
        .remove(filter)
        .insert(newValues);

      await result.view.change(update.key, changeSet).runAsync();
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
    let res = [];
    let arr = this.model.get("_df");
    let cols = this.model.get("_columns");
    for(let i=0; i<arr.shape[0];i++){
      let row = [];
      for(let j=0; j< arr.shape[1]; j++){
        row[cols[j]] = arr.get(i,j);
      }
      res[i] = row;
    }
    return res;
  };

  updateHistogram2D(): any[] {
    let res = [];
    let arr = this.model.get("_df");
    let cols = this.model.get("_columns");
    for(let i=0; i<arr.shape[0];i++){
      for(let j=0; j< arr.shape[1]; j++){
        let row = [];
        row[cols[0]] = i;
        row[cols[1]] = j;
	row[cols[2]] = arr.get(i,j);
	res.push(row);
      }
    }
    return res;
  };
}
