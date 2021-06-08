from __future__ import print_function

import contextlib
import json
import uuid
import sys
from ipydatawidgets import DataUnion
from ipydatawidgets.widgets import DataWidget
from ipydatawidgets.ndarray.serializers import (
    array_to_compressed_json,
    array_from_compressed_json)
import ipywidgets as widgets
import numpy as np
try:
    from ipywidgets import DOMWidget
    from traitlets import Unicode, Dict, Any

except ImportError as err:
    new_err = ImportError(
        "vega.widget requires ipywidgets, which could not be imported. "
        "Is ipywidgets installed?"
    )

    # perform manual exception chaining for python 2 compat
    new_err.__cause__ = err
    raise new_err


__all__ = ['VegaWidget']

#
# The two functions below  (data_union_to_json_compress, data_union_from_json_compress)
# are adapted from ipydatawidgets
# Copyright (c) Jupyter Development Team.
# Distributed under the terms of the Modified BSD License.
#


def data_union_to_json_compress(value, widget):
    """Serializer for union of NDArray and NDArrayWidget"""
    if isinstance(value, widgets.Widget):
        return widgets.widget_serialization['to_json'](value, widget)
    return array_to_compressed_json(value, widget)


def data_union_from_json_compress(value, widget):
    """Deserializer for union of NDArray and NDArrayWidget"""
    if isinstance(value, str) and value.startswith('IPY_MODEL_'):
        return widgets.widget_serialization['from_json'](value, widget)
    return array_from_compressed_json(value, widget)


_serialization = dict(
    to_json=data_union_to_json_compress,
    from_json=data_union_from_json_compress)

class VegaWidget(DOMWidget):
    """An IPython widget display a vega chart.

    Specifying the spec directly::

        widget = VegaWidget({...})
        widget.update(remove='datum.t < 5', insert=[{...}, {...}])

    To modify the created plot, additional options can be passed as in::

        widget = VegaWidget(spec, opt)

    Usage with ``altair``::

        widget = VegaWidget(chart.to_dict())

    To select between vega and vega-lite use the ``$schema`` property on
    the ``spec`` dictionary.

    The chart can be updated by setting the ``spec`` property. In additon
    embedding options, such as the used theme, can be set via the ``opt``
    property::

        widget.spec = {...}
        widget.opt = {"theme": "dark"}

    For streaming data, setting the whole spec may be slow. For this use case,
    ``VegaWidget`` offers the ``update`` method. It sends the data to the
    client without persisting it on the Python side. In particular resetting
    the ``spec`` and ``opt`` properties will lose any data changes performed
    via ``update``.
    """
    # Implementation note: there is a small delay between defining the widget
    # and its display in the frontend. Any message sent during this time
    # interval will be silently ignored by the client. To ensure all updates
    # are handled, they are buffered on the python side until the widget is
    # first displayed. The buffer is the `_pending_updates` attribute and the
    # display state is reflected by the `_displayed` attribute.

    _view_name = Unicode('VegaWidget').tag(sync=True)
    _model_name = Unicode('VegaWidgetModel').tag(sync=True)
    _view_module = Unicode('nbextensions/jupyter-vega/widget').tag(sync=True)
    _model_module = Unicode('nbextensions/jupyter-vega/widget').tag(sync=True)
    _view_module_version = Unicode('0.1.0').tag(sync=True)
    _model_module_version = Unicode('0.1.0').tag(sync=True)
    _spec_source = Unicode('null').tag(sync=True)
    _opt_source = Unicode('null').tag(sync=True)
    _df = DataUnion(
        np.array([], dtype='float32'),
        dtype='float32'
    ).tag(sync=True, **_serialization)
    _columns = Any([]).tag(sync=True)
    def __init__(self, spec=None, opt=None, **kwargs):
        super().__init__(**kwargs)
        self._spec_source = json.dumps(spec)
        self._opt_source = json.dumps(opt)

        self._displayed = False
        self._pending_updates = []

        self.on_msg(self._handle_message)

    def _handle_message(self, widget, msg, _):
        if msg['type'] != "display":
            return

        if self._displayed:
            return

        self._displayed = True

        if not self._pending_updates:
            return

        self.send(dict(type="update", updates=self._pending_updates))
        self._pending_updates = []

    def _reset(self):
        self._displayed = False
        self._pending_updates = []

    @property
    def spec(self):
        return json.loads(self._spec_source)

    @spec.setter
    def spec(self, value):
        self._spec_source = json.dumps(value)
        self._reset()

    @property
    def opt(self):
        return json.loads(self._opt_source)

    @opt.setter
    def opt(self, value):
        self._opt_source = json.dumps(value)
        self._reset()

    def update(self, key, remove=None, insert=None):
        """Update the chart data.

        Updates are only reflected on the client, i.e., after re-displaying
        the widget will show the chart specified in its spec property.

        :param Optional[str] remove:
            a JavaScript expression of items to remove. The item to test can
            be accessed as ``datum``. For example, the call
            ``update(remove="datum.t < 5")`` removes all items with the
            property ``t < 5``.

        :param Optional[List[dict]] insert:
            new items to add to the chat data.
        """
        update = dict(key=key)

        if remove is not None:
            update['remove'] = remove

        if insert is not None:
            update['insert'] = insert

        if self._displayed:
            self.send(dict(type="update", updates=[update]))

        else:
            self._pending_updates.append(update)

    def update_dataframe(self, df, remove=None):
        """
        df = pd.DataFrame(dict(a=[1,2], b=[3,4], x=[1.1,2.2],  y=[3.3,4.4]))
        df = pd.DataFrame(dict(a=[1,2], b=[3,4], x=[1.1,2.2],  y=[3.3,4.4], z=['aa','bb']))
        """
        self._df = df.values
        self._columns = df.columns.to_list()
        update = dict(key='data')
        if remove is not None:
            update['remove'] = remove
        update['insert'] = "@dataframe"
        self.send(dict(type="update", updates=[update]))

    def update_histogram2d(self, arr, columns, remove=None, chunksize=None):
        """
        """
        self._df = arr
        self._columns = columns
        update = dict(key='data')
        if remove is not None:
            update['remove'] = remove
        update['insert'] = "@histogram2d"
        if chunksize is not None:
            step = chunksize//arr.shape[1]
            l0 = list(range(0,arr.shape[0], step))
            l1 = l0[1:] + [arr.shape[0]]
            chunks = list(zip(l0, l1))
            update['chunks'] = chunks
        self.send(dict(type="update", updates=[update]))
