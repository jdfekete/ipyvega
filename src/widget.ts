import { DOMWidgetView, DOMWidgetModel } from "@jupyter-widgets/base";
import { MODULE_NAME, MODULE_VERSION } from "./version";
import { vegaEmbed } from "./index";
import { Result } from "vega-embed";
import * as ndarray from "ndarray";
import { table_serialization, rowProxy, IDict } from "jupyter-tablewidgets";

interface WidgetUpdate {
  key: string;
  remove?: string;
  insert?: any[] | "@dataframe" | "@array2d";
}

interface WidgetUpdateMessage {
  type: "update";
  updates: WidgetUpdate[];
  resize: boolean;
}

// Serialize the widget as an image instead of the whole
// dataset that can be arbitrarily large.
// In a notebook, this makes no difference because the actual serialized
// model is only used when viewing the notebook before running any cell.
// If used as a standalone widget, the serialization will only return an
// image.
function serializeImgURL(imgURL: string, mgr: VegaWidgetModel): string {
  if (mgr.viewInstance === null || mgr.viewInstance.viewElement === undefined) {
    console.log("No view");
    return imgURL;
  }
  let id_ = mgr.viewInstance.viewElement.id;
  if (id_ === "" || id_ === undefined) {
    //hach to avoid jquery dep.
    id_ = "VEGA_ID" + Math.random().toString().substr(2, 40);
    mgr.viewInstance.viewElement.id = id_;
  }
  let canvas = document.querySelector("#" + id_ + " canvas");
  if (canvas === null) {
    console.log("no canvas");
    return imgURL;
  }
  // @ts-ignore
  return canvas.toDataURL();
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
    return {
      ...DOMWidgetModel.prototype.defaults(),
      _model_name: "VegaWidgetModel",
      _view_name: "VegaWidget",
      _spec_source: "",
      _opt_source: "",
      _df: ndarray([]),
      _img_url: "",
      _columns: [],
    };
  }
  viewInstance: VegaWidget | null = null;
  static serializers = {
    ...DOMWidgetModel.serializers,
    _img_url: { serialize: serializeImgURL } as any,
    _df: table_serialization as any,
  };

  static model_name = "VegaWidgetModel";
  static model_module = MODULE_NAME;
  static model_module_version = MODULE_VERSION;
  static view_name = "VegaWidget";
  static view_module = MODULE_NAME;
  static view_module_version = MODULE_VERSION;
}

export class VegaWidget extends DOMWidgetView {
  result?: Result;
  viewElement = document.createElement("div");
  errorElement = document.createElement("div");
  async render() {
    this.el.appendChild(this.viewElement);
    this.errorElement.style.color = "red";
    this.el.appendChild(this.errorElement);
    let model = this.model as VegaWidgetModel;
    model.viewInstance = this;
    const reembed = async () => {
      const spec = JSON.parse(this.model.get("_spec_source"));
      const opt = JSON.parse(this.model.get("_opt_source") || "{}");
      const imgURL = this.model.get("_img_url");
      if (imgURL !== "" && imgURL !== "null") {
        let imgElement = document.createElement("img");
        imgElement.src = imgURL;
        this.viewElement.appendChild(imgElement);
        this.model.set("_img_url", "null");
        return;
      }
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

    const applyUpdate = async (update: WidgetUpdate, resize: boolean) => {
      const result = this.result;
      if (result == null) {
        throw new Error("Internal error: no view attached to widget");
      }
      const filter = new Function(
        "datum",
        `return (${update.remove || "false"})`
      );
      let newValues = update.insert || [];
      if (newValues === "@dataframe") {
        newValues = this.updateDataFrame();
      } else if (newValues === "@array2d") {
        newValues = this.updateArray2D();
      }
      const changeSet = result.view
        .changeset()
        .remove(filter)
        .insert(newValues);
      const view = result.view.change(update.key, changeSet);
      if (resize) view.resize();
      await view.runAsync();
    };

    const applyUpdates = async (message: WidgetUpdateMessage) => {
      for (const update of message.updates) {
        await applyUpdate(update, message.resize);
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
    const table = this.model.get("_df");
    const proxy = rowProxy(table);
    const rows = Array(table.size);
    for (let i = 0; i < rows.length; ++i) {
      rows[i] = proxy(i);
    }
    return rows;
  }

  updateArray2D(): any[] {
    // A 2D array is encoded for transfer like  a dataframe
    // having an unique, (2D) column.
    // The column name is "special", i.e. it is a string containing
    // three comma separated keys, e.g. "x,y,z"
    // this format is useful for encoding, for example, a heatmap
    const table = this.model.get("_df");
    const res = Array(table.size * table.size);
    const fancyCol = table.columns[0];
    const arr: ndarray.NdArray = table.data[fancyCol];
    const cols: string[] = fancyCol.split(",");
    let k = 0;
    for (let i = 0; i < arr.shape[0]; i++) {
      for (let j = 0; j < arr.shape[1]; j++) {
        let row: IDict<Number> = {};
        row[cols[0]] = i;
        row[cols[1]] = j;
        row[cols[2]] = arr.get(i, j);
        res[k++] = row;
      }
    }
    return res;
  }
}
