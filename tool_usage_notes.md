# `replace` 工具使用注意事項

## 錯誤 1: `params must have required property 'new_string'`

當使用 `replace` 工具時，代表新內容的參數名稱是 `new_string`，而不是 `newContent`。如果用錯參數名稱，就會發生這個錯誤。

**錯誤範例:**
```python
print(default_api.replace(..., newContent="..."))
```

**正確範例:**
```python
print(default_api.replace(..., new_string="..."))
```

## 錯誤 2: `A secondary check determined that no changes were necessary...`

這個錯誤訊息表示 `replace` 工具判斷不需要做任何修改。這通常發生在 `old_string` 所指定的文字在檔案中找不到。

可能原因有：
1.  **目標文字不存在**: `old_string` 的內容與檔案中的內容不完全匹配（包含空格、換行、縮排）。
2.  **重複操作**: 嘗試執行的變更其實已經被先前的操作套用。即使上次操作後工具回報了錯誤，變更仍可能已經成功寫入檔案。

**解決方法:**
- 在執行 `replace` 前，先用 `read_file` 確認檔案的最新內容，確保 `old_string` 完全符合當前的檔案內容。
- 如果收到此錯誤，請再次用 `read_file` 檢查檔案，確認是否變更已存在。如果已存在，則無需再次執行 `replace`。
