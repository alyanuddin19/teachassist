def write_excel(df, path):
    df.to_excel(path, index=False)
