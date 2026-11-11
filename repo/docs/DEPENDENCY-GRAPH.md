# Somnium — Dependency Graph

Automatically generated from relative JavaScript imports.

The direction of each arrow is:

`Importing directory --> Imported directory`

```mermaid
flowchart TD
    D0["src"]
    D1["src/atmosphere"]
    D2["src/buildings"]
    D3["src/core"]
    D4["src/demo"]
    D5["src/ecology"]
    D6["src/editor"]
    D7["src/environment"]
    D8["src/environment/topography"]
    D9["src/game"]
    D10["src/geology"]
    D11["src/rendering"]
    D12["src/scene"]
    D13["src/ui"]
    D14["src/water"]
    D15["src/world"]
    D16["src/world/fields"]
    D17["src/world/fields/geometry"]
    D18["src/world/persistence"]
    D0 --> D12
    D1 --> D11
    D2 --> D11
    D4 --> D9
    D4 --> D15
    D4 --> D17
    D5 --> D1
    D5 --> D3
    D5 --> D7
    D5 --> D10
    D5 --> D11
    D5 --> D14
    D5 --> D16
    D7 --> D8
    D10 --> D3
    D10 --> D11
    D11 --> D5
    D12 --> D2
    D12 --> D4
    D12 --> D6
    D12 --> D7
    D12 --> D9
    D12 --> D11
    D12 --> D13
    D12 --> D14
    D12 --> D15
    D12 --> D17
    D12 --> D18
    D15 --> D1
    D15 --> D3
    D15 --> D5
    D15 --> D7
    D15 --> D8
    D15 --> D10
    D15 --> D11
    D15 --> D17
    D16 --> D17
    D17 --> D16
```

## Dependency Statistics

- JavaScript files analyzed: 128
- Source directories analyzed: 19
- Cross-directory dependency relationships: 38

## Limitations

- Only statically identifiable relative imports are included.
- External dependencies are excluded.
- Runtime service relationships are not inferred.
- This graph represents source dependencies, not execution order.
