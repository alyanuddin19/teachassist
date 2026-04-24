import pandas as pd

def extract_excel(path):
    df = pd.read_excel(path, header=None)

    # Horizontal table
    if df.shape[1] > 1:
        df.columns = df.iloc[0].astype(str)
        return df.iloc[1:].reset_index(drop=True)

    # Vertical template (headers in rows)
    headers = df.iloc[:, 0].dropna().astype(str).tolist()
    return pd.DataFrame(columns=headers)
