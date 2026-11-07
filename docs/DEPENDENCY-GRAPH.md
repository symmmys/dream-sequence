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
    D4["src/ecology"]
    D5["src/editor"]
    D6["src/environment"]
    D7["src/game"]
    D8["src/geology"]
    D9["src/rendering"]
    D10["src/scene"]
    D11["src/ui"]
    D12["src/water"]
    D13["src/world"]
    D14["src/world/fields"]
    D15["src/world/fields/geometry"]
    D16["src/world/persistence"]
    D0 --> D10
    D1 --> D9
    D2 --> D9
    D4 --> D1
    D4 --> D3
    D4 --> D6
    D4 --> D8
    D4 --> D9
    D4 --> D12
    D4 --> D14
    D8 --> D3
    D8 --> D9
    D9 --> D4
    D10 --> D2
    D10 --> D5
    D10 --> D6
    D10 --> D7
    D10 --> D9
    D10 --> D11
    D10 --> D12
    D10 --> D13
    D10 --> D15
    D10 --> D16
    D13 --> D1
    D13 --> D3
    D13 --> D4
    D13 --> D6
    D13 --> D8
    D13 --> D9
    D14 --> D15
    D15 --> D14
```

## Dependency Statistics

- JavaScript files analyzed: 88
- Source directories analyzed: 17
- Cross-directory dependency relationships: 31

## Limitations

- Only statically identifiable relative imports are included.
- External dependencies are excluded.
- Runtime service relationships are not inferred.
- This graph represents source dependencies, not execution order.
