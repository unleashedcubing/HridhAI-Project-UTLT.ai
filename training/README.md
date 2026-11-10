# UTLT.ai synthetic activity model

`households_labeled.jsonl` and `households_unlabeled.jsonl` contain the same 200 simulated homes, seven days each, with and without activity labels. Every home also has a household survey. The generator uses a fixed seed; these are illustrative patterns, not measured Hyderabad households or claims about typical water use.

Regenerate and train locally:

```sh
python training/generate_households.py
python -m pip install -r training/requirements.txt
python training/train_model.py
```

The free scikit-learn random forest is trained on 160 households and validated on 40 entirely separate synthetic households. `validation.json` records synthetic holdout accuracy and macro F1. `model.json` exports the fitted numerical trees for inference directly in the browser; the phone does not need a paid model or a Python server.

**Limit:** a single whole-home flow meter records amount and time, not the activity that used the water. Model labels are suggestions. The app asks the household to confirm uncertain periods at the end of each eligible day: the first seven survey days, then the first three days of each month. Confirmed labels stay on that phone and adapt nearby future suggestions. Real-world accuracy has not been validated.
