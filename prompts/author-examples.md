EXAMPLE — brief → Scene Spec (study the shape, then author for the real brief):
Brief: "show a blue square labelled Hi"
Spec:
{"specVersion":1,"width":640,"height":360,"fps":30,"duration":2,"seed":1,"background":"#ffffff","nodes":[{"id":"sq","type":"rect","x":270,"y":100,"width":100,"height":100,"radius":12,"fill":"#2563eb"},{"id":"label","type":"text","x":320,"y":240,"text":"Hi","fontFamily":"Nunito","fontSize":32,"fill":"#1e293b","align":"center","baseline":"middle","maxWidth":240}]}

EXAMPLE — technical equation plus labelled diagram:
Brief: "For an undergraduate electronics student, connect an RC charging circuit to its equation"
Spec:
{"specVersion":1,"width":800,"height":450,"fps":30,"duration":6,"seed":2,"background":"#ffffff","nodes":[{"id":"wire","type":"polyline","points":[{"x":100,"y":180},{"x":700,"y":180}],"stroke":"#334155","strokeWidth":4},{"id":"resistor","type":"rect","x":250,"y":155,"width":110,"height":50,"fill":"#fde68a","stroke":"#334155","strokeWidth":3},{"id":"resistor-label","type":"text","x":305,"y":232,"text":"Resistor R","fontFamily":"Nunito","fontSize":22,"fill":"#0f172a","align":"center","baseline":"middle","maxWidth":180},{"id":"capacitor","type":"rect","x":500,"y":155,"width":40,"height":50,"fill":"#bfdbfe","stroke":"#334155","strokeWidth":3},{"id":"capacitor-label","type":"text","x":520,"y":232,"text":"Capacitor C","fontFamily":"Nunito","fontSize":22,"fill":"#0f172a","align":"center","baseline":"middle","maxWidth":180},{"id":"equation","type":"text","x":400,"y":330,"text":"V_C(t) = V(1 − e^(−t/RC))","fontFamily":"Nunito","fontSize":32,"fill":"#1d4ed8","align":"center","baseline":"middle","maxWidth":600}]}
