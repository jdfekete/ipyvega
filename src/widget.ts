import { DOMWidgetView, DOMWidgetModel } from "@jupyter-widgets/base";
import { vegaEmbed } from "./index";
import { Result } from "vega-embed";
import * as ndarray from "ndarray";
//import * as ndarray_unpack from "ndarray-unpack";
import {
  data_union_serialization,
  listenToUnion,
} from 'jupyter-dataserializers';

interface WidgetUpdate {
  key: string;
  remove?: string;
  insert?: any[] | string;
  chunk?: any;
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
         let lower = 0;
	 let upper = this.model.get("_df").shape[0];
         let chunk = update.chunk||null;
	 if(chunk != null){
	   lower = chunk[0];
	   upper = chunk[1];
	 }
	 newValues = this.updateHistogram2D(lower, upper);
      }
      const changeSet = result.view
        .changeset()
        .remove(filter)
        .insert(newValues);

      await result.view.change(update.key, changeSet).runAsync();
    };
    const applyUpdates = async (message: WidgetUpdateMessage) => {
      console.log(message.updates);
      let updates = this.split_updates(message.updates);
      for (const update of updates) {
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
  split_updates(updates: any): any {
    if(updates.length==1){
      let msg = updates[0];
      if(msg.insert == "@histogram2d"){
      	let chunks = msg.chunks||[];
	if(chunks!=[]){
	  console.log("chunks", chunks);
	  let res = [];
	  for (const chunk of chunks){
	    res.push({key: msg.key, insert: "@histogram2d", chunk: chunk, remove: false});
	  }
	  res[0].remove = msg.remove||false;
	  console.log("split", res);
	  return res;
        }
      }
    }
    return updates;
    };   

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

  updateHistogram2D(lower: any, upper: any): any[] {
    let res = [];
    let arr = this.model.get("_df");
    let cols = this.model.get("_columns");
    for(let i=lower; i<upper;i++){
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
